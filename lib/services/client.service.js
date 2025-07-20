"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const baileys_1 = __importStar(require("@whiskeysockets/baileys"));
const pino_1 = __importDefault(require("pino"));
const boom_1 = require("@hapi/boom");
const node_cache_1 = __importDefault(require("@cacheable/node-cache"));
const qrcode_terminal_1 = __importDefault(require("qrcode-terminal"));
const qrcode_1 = __importDefault(require("qrcode"));
const client_model_1 = __importDefault(require("../models/client.model"));
const socket_service_1 = __importDefault(require("./socket.service"));
const useMongoDBAuthState = async (clientId) => {
    const client = await client_model_1.default.findOne({ clientId }).lean();
    let creds;
    if (client && client.session && client.session.creds) {
        creds = JSON.parse(JSON.stringify(client.session.creds), baileys_1.BufferJSON.reviver);
    }
    else {
        creds = (0, baileys_1.initAuthCreds)();
    }
    const keys = client?.session?.keys || {};
    const saveCreds = async () => {
        const session = {
            creds: JSON.parse(JSON.stringify(creds, baileys_1.BufferJSON.replacer)),
            keys
        };
        try {
            await client_model_1.default.updateOne({ clientId }, { $set: { session: session } });
        }
        catch (error) {
            console.error('Failed to save auth state to MongoDB', error);
        }
    };
    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data = {};
                    for (const id of ids) {
                        const key = `${type}-${id}`;
                        const value = keys[key];
                        if (value) {
                            data[id] = value;
                        }
                    }
                    return data;
                },
                set: async (data) => {
                    for (const type in data) {
                        const typeData = data[type];
                        if (typeData) {
                            for (const id in typeData) {
                                const key = `${type}-${id}`;
                                keys[key] = typeData[id];
                            }
                        }
                    }
                    await saveCreds();
                },
            },
        },
        saveCreds,
    };
};
class ClientService {
    constructor() {
        this.clients = new Map();
    }
    static getInstance() {
        if (!ClientService.instance) {
            ClientService.instance = new ClientService();
        }
        return ClientService.instance;
    }
    getClient(clientId) {
        return this.clients.get(clientId);
    }
    async disconnectClient(clientId) {
        const sock = this.clients.get(clientId);
        if (sock) {
            console.log(`Disconnecting client ${clientId}...`);
            await sock.end(new boom_1.Boom('Manual Disconnect', { statusCode: baileys_1.DisconnectReason.connectionClosed }));
            this.clients.delete(clientId);
            await client_model_1.default.updateOne({ clientId }, { status: 'DISCONNECTED' });
        }
    }
    async logoutClient(clientId) {
        const sock = this.clients.get(clientId);
        if (sock) {
            console.log(`Logging out client ${clientId}...`);
            await sock.logout();
            this.clients.delete(clientId);
        }
        // Ensure session is cleared from DB regardless of whether the client was in memory
        await client_model_1.default.updateOne({ clientId }, { $set: { session: null, status: 'DISCONNECTED' } });
    }
    async initializeClient(clientId) {
        console.log(`Initializing WhatsApp client for ID: ${clientId}`);
        const msgRetryCounterCache = new node_cache_1.default();
        const logger = (0, pino_1.default)({ level: 'warn' });
        const { state, saveCreds } = await useMongoDBAuthState(clientId);
        const { version, isLatest } = await (0, baileys_1.fetchLatestBaileysVersion)();
        console.log(`using WA v${version.join('.')}, isLatest: ${isLatest}`);
        const sock = (0, baileys_1.default)({
            version,
            logger,
            auth: state,
            msgRetryCounterCache,
            generateHighQualityLinkPreview: true,
            async getMessage(key) {
                return baileys_1.proto.Message.fromObject({});
            }
        });
        this.clients.set(clientId, sock);
        await client_model_1.default.updateOne({ clientId }, { status: 'INITIALIZING' });
        this.setupEventListeners(sock, clientId, saveCreds);
        return sock;
    }
    setupEventListeners(sock, clientId, saveCreds) {
        const io = socket_service_1.default.getIO();
        sock.ev.process(async (events) => {
            const emitEvent = (type, data) => {
                io.to(clientId).emit('messageEvent', { type, data });
            };
            if (events['connection.update']) {
                const update = events['connection.update'];
                emitEvent('connection.update', update);
                const { connection, lastDisconnect, qr } = update;
                if (qr) {
                    console.log(`QR RECEIVED for ${clientId}`);
                    // Print to terminal for dev purposes
                    qrcode_terminal_1.default.generate(qr, { small: true });
                    // Generate data URL for websocket
                    const qrCodeDataURL = await qrcode_1.default.toDataURL(qr);
                    io.to(clientId).emit('qr', { qrCode: qrCodeDataURL });
                    io.to(clientId).emit('statusChange', { status: 'WAITING_QR' });
                    await client_model_1.default.updateOne({ clientId }, { status: 'WAITING_QR' });
                }
                if (connection === 'close') {
                    const statusCode = lastDisconnect?.error?.output?.statusCode;
                    const status = (statusCode === baileys_1.DisconnectReason.loggedOut || statusCode === baileys_1.DisconnectReason.connectionClosed) ? 'DISCONNECTED' : 'SYNCING';
                    io.to(clientId).emit('statusChange', { status });
                    if (statusCode === baileys_1.DisconnectReason.connectionClosed) {
                        console.log(`Connection closed manually for ${clientId}. Not reconnecting.`);
                    }
                    else if (statusCode !== baileys_1.DisconnectReason.loggedOut) {
                        console.log(`Syncing client ${clientId}...`);
                        this.initializeClient(clientId);
                    }
                    else {
                        console.log(`Connection closed for ${clientId}. You are logged out.`);
                        this.clients.delete(clientId);
                        await client_model_1.default.updateOne({ clientId }, { status: 'DISCONNECTED' });
                    }
                }
                if (connection === 'open') {
                    console.log(`Client ${clientId} connected!`);
                    io.to(clientId).emit('statusChange', { status: 'AUTHENTICATED' });
                    const { id, name } = sock.user;
                    const phoneNumber = id.split(':')[0];
                    await client_model_1.default.updateOne({ clientId }, {
                        status: 'AUTHENTICATED',
                        phoneNumber: phoneNumber,
                        profileName: name,
                    });
                }
            }
            if (events['creds.update']) {
                emitEvent('creds.update', events['creds.update']);
                await saveCreds();
            }
            if (events['messages.upsert']) {
                emitEvent('messages.upsert', events['messages.upsert']);
            }
            if (events['messages.update']) {
                emitEvent('messages.update', events['messages.update']);
            }
            if (events['messages.reaction']) {
                emitEvent('messages.reaction', events['messages.reaction']);
            }
            if (events['message-receipt.update']) {
                emitEvent('message-receipt.update', events['message-receipt.update']);
            }
            if (events['presence.update']) {
                emitEvent('presence.update', events['presence.update']);
            }
            if (events['chats.update']) {
                emitEvent('chats.update', events['chats.update']);
            }
            if (events['chats.delete']) {
                emitEvent('chats.delete', events['chats.delete']);
            }
            if (events['contacts.update']) {
                emitEvent('contacts.update', events['contacts.update']);
            }
            if (events['labels.edit']) {
                emitEvent('labels.edit', events['labels.edit']);
            }
            if (events['labels.association']) {
                emitEvent('labels.association', events['labels.association']);
            }
            if (events.call) {
                emitEvent('call', events.call);
            }
            if (events['messaging-history.set']) {
                emitEvent('messaging-history.set', events['messaging-history.set']);
            }
        });
    }
}
exports.default = ClientService.getInstance();
