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
const user_service_1 = __importDefault(require("./user.service"));
const useMongoDBAuthState = async (clientId) => {
    const client = await client_model_1.default.findById(clientId).lean();
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
            await client_model_1.default.findByIdAndUpdate(clientId, { $set: { session: session } });
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
        this.qrRetryCount = new Map();
        this.disconnectedClients = new Set();
        this.reconnectAttempts = new Map();
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
            await client_model_1.default.findByIdAndUpdate(clientId, { status: 'DISCONNECTED' });
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
        await client_model_1.default.findByIdAndUpdate(clientId, { $set: { session: null, status: 'DISCONNECTED' } });
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
        await client_model_1.default.findByIdAndUpdate(clientId, { status: 'INITIALIZING' });
        this.setupEventListeners(sock, clientId, saveCreds);
        return sock;
    }
    setupEventListeners(sock, clientId, saveCreds) {
        const io = socket_service_1.default.getIO();
        sock.ev.process(async (events) => {
            if (events['connection.update']) {
                const update = events['connection.update'];
                io.to(clientId).emit('session', { type: 'connection.update', data: update });
                const { connection, lastDisconnect, qr } = update;
                if (qr) {
                    // QR retry logic
                    const prevCount = this.qrRetryCount.get(clientId) || 0;
                    const newCount = prevCount + 1;
                    this.qrRetryCount.set(clientId, newCount);
                    console.log(`QR RECEIVED for ${clientId} (attempt ${newCount}/5)`);
                    if (newCount > 5) {
                        console.log(`QR code generated more than 5 times for ${clientId}. Disconnecting client.`);
                        await this.disconnectClient(clientId);
                        this.qrRetryCount.delete(clientId);
                        io.to(clientId).emit('statusChange', {
                            status: 'DISCONNECTED',
                            message: 'QR code generated too many times. Please try again later.'
                        });
                        return;
                    }
                    // Print to terminal for dev purposes
                    qrcode_terminal_1.default.generate(qr, { small: true });
                    // Generate data URL for websocket
                    const qrCodeDataURL = await qrcode_1.default.toDataURL(qr);
                    io.to(clientId).emit('qr', { qrCode: qrCodeDataURL });
                    io.to(clientId).emit('statusChange', { status: 'WAITING_QR' });
                    await client_model_1.default.findByIdAndUpdate(clientId, { status: 'WAITING_QR' });
                }
                if (connection === 'close') {
                    const statusCode = lastDisconnect?.error?.output?.statusCode;
                    const errorCode = lastDisconnect?.error?.output?.payload?.['stream:error']?.['@attrs']?.code;
                    // Handle specific WhatsApp stream errors
                    if (errorCode === '515') {
                        console.log(`WhatsApp stream error (code 515) for client ${clientId}. Starting reconnection...`);
                        // Remove the client from the map
                        this.clients.delete(clientId);
                        // Start reconnection with backoff
                        this.reconnectWithBackoff(clientId, io);
                        return;
                    }
                    if (statusCode === baileys_1.DisconnectReason.connectionReplaced) {
                        console.log(`Connection for ${clientId} was replaced. Not reconnecting.`);
                        io.to(clientId).emit('statusChange', {
                            status: 'DISCONNECTED',
                            message: 'Connection replaced by another session.'
                        });
                        this.clients.delete(clientId);
                        await client_model_1.default.findByIdAndUpdate(clientId, { status: 'DISCONNECTED' });
                    }
                    else if (statusCode === baileys_1.DisconnectReason.loggedOut) {
                        console.log(`Connection closed for ${clientId}. You are logged out.`);
                        io.to(clientId).emit('statusChange', { status: 'DISCONNECTED' });
                        this.clients.delete(clientId);
                        await client_model_1.default.findByIdAndUpdate(clientId, { status: 'DISCONNECTED' });
                        this.disconnectedClients.add(clientId);
                    }
                    else if (statusCode === baileys_1.DisconnectReason.connectionClosed) {
                        console.log(`Connection closed manually for ${clientId}. Not reconnecting.`);
                        io.to(clientId).emit('statusChange', { status: 'DISCONNECTED' });
                        this.clients.delete(clientId);
                    }
                    else {
                        console.log(`Connection closed for client ${clientId} with status code: ${statusCode}. Starting reconnection...`);
                        // Remove the client from the map
                        this.clients.delete(clientId);
                        // Start reconnection with backoff
                        this.reconnectWithBackoff(clientId, io);
                    }
                }
                if (connection === 'open') {
                    console.log(`Client ${clientId} connected!`);
                    io.to(clientId).emit('statusChange', { status: 'AUTHENTICATED' });
                    this.qrRetryCount.delete(clientId);
                    this.reconnectAttempts.delete(clientId);
                    this.disconnectedClients.delete(clientId);
                    const { id, name } = sock.user;
                    const phoneNumber = id.split(':')[0];
                    await client_model_1.default.findByIdAndUpdate(clientId, {
                        status: 'AUTHENTICATED',
                        phoneNumber: phoneNumber,
                        profileName: name,
                    });
                }
            }
            if (events['creds.update']) {
                io.to(clientId).emit('session', { type: 'creds.update', data: events['creds.update'] });
                await saveCreds();
            }
            if (events['messages.upsert']) {
                if (this.disconnectedClients.has(clientId))
                    return;
                io.to(clientId).emit('messages', { type: 'messages.upsert', data: events['messages.upsert'] });
                // Process incoming messages for activation codes
                if (events['messages.upsert'].type === 'notify' &&
                    Array.isArray(events['messages.upsert'].messages)) {
                    for (const message of events['messages.upsert'].messages) {
                        try {
                            // Process each message for activation codes
                            await user_service_1.default.processIncomingMessage(message, clientId);
                        }
                        catch (error) {
                            console.error('Error processing message for activation:', error);
                        }
                    }
                }
            }
            if (events['messages.update']) {
                if (this.disconnectedClients.has(clientId))
                    return;
                io.to(clientId).emit('messages', { type: 'messages.update', data: events['messages.update'] });
            }
            if (events['messages.delete']) {
                if (this.disconnectedClients.has(clientId))
                    return;
                io.to(clientId).emit('messages', { type: 'messages.delete', data: events['messages.delete'] });
            }
            if (events['messages.reaction']) {
                if (this.disconnectedClients.has(clientId))
                    return;
                io.to(clientId).emit('messages', { type: 'messages.reaction', data: events['messages.reaction'] });
            }
            if (events['message-receipt.update']) {
                if (this.disconnectedClients.has(clientId))
                    return;
                io.to(clientId).emit('messages', { type: 'message-receipt.update', data: events['message-receipt.update'] });
            }
            if (events['presence.update']) {
                io.to(clientId).emit('messages', { type: 'presence.update', data: events['presence.update'] });
            }
            if (events['chats.upsert']) {
                if (this.disconnectedClients.has(clientId))
                    return;
                io.to(clientId).emit('chats', { type: 'chats.upsert', data: events['chats.upsert'] });
            }
            if (events['chats.update']) {
                if (this.disconnectedClients.has(clientId))
                    return;
                io.to(clientId).emit('chats', { type: 'chats.update', data: events['chats.update'] });
            }
            if (events['chats.delete']) {
                if (this.disconnectedClients.has(clientId))
                    return;
                io.to(clientId).emit('chats', { type: 'chats.delete', data: events['chats.delete'] });
            }
            if (events['contacts.update']) {
                io.to(clientId).emit('chats', { type: 'contacts.update', data: events['contacts.update'] });
            }
            if (events['contacts.upsert']) {
                io.to(clientId).emit('chats', { type: 'contacts.upsert', data: events['contacts.upsert'] });
            }
            // if (events['labels.edit']) {
            //     io.to(clientId).emit('labels', { type: 'labels.edit', data: events['labels.edit'] });
            // }
            // if (events['labels.association']) {
            //     io.to(clientId).emit('labels', { type: 'labels.association', data: events['labels.association'] });
            // }
            // if (events['groups.upsert']) {
            //     io.to(clientId).emit('groups', { type: 'groups.upsert', data: events['groups.upsert'] });
            // }
            // if (events['groups.update']) {
            //     io.to(clientId).emit('groups', { type: 'groups.update', data: events['groups.update'] });
            // }
            // if (events['group-participants.update']) {
            //     io.to(clientId).emit('groups', { type: 'group-participants.update', data: events['group-participants.update'] });
            // }
            if (events.call) {
                io.to(clientId).emit('calls', { type: 'call', data: events.call });
            }
            if (events['messaging-history.set']) {
                // Send the complete history data without filtering
                const historyData = events['messaging-history.set'];
                io.to(clientId).emit('history', { type: 'messaging-history.set', data: historyData });
            }
        });
    }
    async reconnectWithBackoff(clientId, io) {
        const attempts = this.reconnectAttempts.get(clientId) || 0;
        this.reconnectAttempts.set(clientId, attempts + 1);
        // Exponential backoff: 2^n seconds, max 5 minutes
        const delaySeconds = Math.min(Math.pow(2, attempts), 300);
        io.to(clientId).emit('statusChange', {
            status: 'RECONNECTING',
            message: `Reconnecting in ${delaySeconds} seconds...`
        });
        console.log(`Will attempt to reconnect client ${clientId} in ${delaySeconds} seconds (attempt ${attempts + 1})`);
        // Max 10 reconnect attempts
        if (attempts >= 10) {
            console.log(`Maximum reconnection attempts reached for client ${clientId}.`);
            io.to(clientId).emit('statusChange', {
                status: 'DISCONNECTED',
                message: 'Maximum reconnection attempts reached. Please reconnect manually.'
            });
            await client_model_1.default.findByIdAndUpdate(clientId, { status: 'DISCONNECTED' });
            this.reconnectAttempts.delete(clientId);
            return;
        }
        // Set status to reconnecting in database
        await client_model_1.default.findByIdAndUpdate(clientId, { status: 'RECONNECTING' });
        setTimeout(async () => {
            try {
                console.log(`Attempting to reconnect client ${clientId}...`);
                await this.initializeClient(clientId);
                io.to(clientId).emit('statusChange', { status: 'INITIALIZING' });
            }
            catch (error) {
                console.error(`Failed to reconnect client ${clientId}:`, error);
                // Try again with backoff
                this.reconnectWithBackoff(clientId, io);
            }
        }, delaySeconds * 1000);
    }
}
exports.default = ClientService.getInstance();
