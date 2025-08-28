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
const translation_service_1 = __importDefault(require("./translation.service"));
const logger_util_1 = __importDefault(require("../utils/logger.util"));
const webhook_service_1 = __importDefault(require("./webhook.service"));
const user_model_1 = __importDefault(require("../models/user.model"));
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
        this.manualDisconnections = new Set(); // Track manual disconnections
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
    getAllConnectedClients() {
        const connectedClients = [];
        for (const [clientId, client] of this.clients.entries()) {
            // Check if client is authenticated and connected
            if (client && client.user) {
                connectedClients.push(clientId);
            }
        }
        return connectedClients;
    }
    async disconnectClient(clientId) {
        const sock = this.clients.get(clientId);
        if (sock) {
            console.log(`Disconnecting client ${clientId}...`);
            // Mark as manual disconnection
            this.manualDisconnections.add(clientId);
            await sock.end(new boom_1.Boom('Manual Disconnect', { statusCode: baileys_1.DisconnectReason.connectionClosed }));
            this.clients.delete(clientId);
            await client_model_1.default.findByIdAndUpdate(clientId, { status: 'DISCONNECTED' });
        }
    }
    async logoutClient(clientId) {
        const sock = this.clients.get(clientId);
        if (sock) {
            console.log(`Logging out client ${clientId}...`);
            // Mark as manual disconnection
            this.manualDisconnections.add(clientId);
            await sock.logout();
            this.clients.delete(clientId);
        }
        // Ensure session is cleared from DB regardless of whether the client was in memory
        await client_model_1.default.findByIdAndUpdate(clientId, { $set: { session: null, status: 'DISCONNECTED' } });
    }
    async initializeClient(clientId) {
        logger_util_1.default.info(`Initializing WhatsApp client for ID: ${clientId}`);
        const msgRetryCounterCache = new node_cache_1.default();
        const pinoLogger = (0, pino_1.default)({ level: 'silent' }); // Changed from 'warn' to 'silent' to reduce logs
        const { state, saveCreds } = await useMongoDBAuthState(clientId);
        const { version, isLatest } = await (0, baileys_1.fetchLatestBaileysVersion)();
        // Only log version if it's not the latest
        if (!isLatest) {
            console.log(`Using WA v${version.join('.')}, isLatest: ${isLatest}`);
        }
        const sock = (0, baileys_1.default)({
            version,
            logger: pinoLogger,
            auth: state,
            msgRetryCounterCache,
            generateHighQualityLinkPreview: true,
            async getMessage(_key) {
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
                    const isManualDisconnect = this.manualDisconnections.has(clientId);
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
                        if (isManualDisconnect) {
                            console.log(`Connection closed manually for ${clientId}. Not reconnecting.`);
                            io.to(clientId).emit('statusChange', { status: 'DISCONNECTED' });
                            this.clients.delete(clientId);
                            // Clean up manual disconnection tracking
                            this.manualDisconnections.delete(clientId);
                        }
                        else {
                            console.log(`Client ${clientId} disconnected unexpectedly, reconnecting...`);
                            io.to(clientId).emit('statusChange', {
                                status: 'RECONNECTING',
                                message: 'Connection lost. Attempting to reconnect...'
                            });
                            this.clients.delete(clientId);
                            // Start reconnection with backoff
                            this.reconnectWithBackoff(clientId, io);
                        }
                    }
                    else {
                        console.log(`Client ${clientId} disconnected (code: ${statusCode}), reconnecting...`);
                        // Remove the client from the map
                        this.clients.delete(clientId);
                        // Start reconnection with backoff
                        this.reconnectWithBackoff(clientId, io);
                    }
                }
                if (connection === 'open') {
                    logger_util_1.default.success(`Client ${clientId} authenticated successfully`);
                    io.to(clientId).emit('statusChange', { status: 'AUTHENTICATED' });
                    this.qrRetryCount.delete(clientId);
                    this.reconnectAttempts.delete(clientId);
                    this.disconnectedClients.delete(clientId);
                    this.manualDisconnections.delete(clientId); // Clean up manual disconnection tracking
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
                console.log(`Incoming message detected for client ${clientId}, type: ${events['messages.upsert'].type}, count: ${events['messages.upsert'].messages?.length || 0}`);
                // Only skip WebSocket emission if disconnected, but still process messages
                if (!this.disconnectedClients.has(clientId)) {
                    io.to(clientId).emit('messages', { type: 'messages.upsert', data: events['messages.upsert'] });
                }
                // Always process incoming messages regardless of disconnection status
                // This ensures users get responses even during temporary connection issues
                if (events['messages.upsert'].type === 'notify' &&
                    Array.isArray(events['messages.upsert'].messages)) {
                    for (const message of events['messages.upsert'].messages) {
                        try {
                            const remoteJid = message.key?.remoteJid;
                            // Guard: skip stub/no-content messages (often due to missing/invalid keys)
                            if (!message.message) {
                                console.warn('Received stub/no-content message. Skipping processing.', {
                                    clientId,
                                    remoteJid,
                                    messageStubType: message.messageStubType,
                                    messageStubParameters: message.messageStubParameters
                                });
                                continue;
                            }
                            const messageText = message.message?.conversation || message.message?.extendedTextMessage?.text || 'Non-text';
                            console.log(`Processing message from ${remoteJid}: "${messageText}"`);
                            // Get client data to determine client type
                            const clientData = await client_model_1.default.findById(clientId);
                            if (!clientData) {
                                console.error(`Client ${clientId} not found in database`);
                                continue;
                            }
                            // Capture user status at the time of message receipt (before any services run)
                            let userAtReceipt = null;
                            const receiptJid = message.key?.remoteJid;
                            const receiptPhone = receiptJid ? parseInt(receiptJid.split('@')[0]) : null;
                            if (receiptPhone && !isNaN(receiptPhone)) {
                                userAtReceipt = await user_model_1.default.findOne({ wa_num: receiptPhone }).lean();
                            }
                            // Route message based on client type
                            if (clientData.client_type === 'translate') {
                                console.log(`Routing to translation service for client ${clientId}`);
                                await translation_service_1.default.processTranslationMessage(message, clientId);
                            }
                            else {
                                // Default to chatbot behavior for 'chatbot' type or any other type
                                console.log(`[DEBUG] Routing to user service for client ${clientId} (type: ${clientData.client_type})`);
                                await user_service_1.default.processIncomingMessage(message, clientId);
                            }
                            // Process webhook for this specific message using the already-fetched client data
                            this.processWebhookAsync(clientId, [message], clientData, userAtReceipt);
                        }
                        catch (error) {
                            console.error('Error processing message:', error);
                        }
                    }
                    // BACKGROUND: Process webhook (non-blocking)
                    // this.processWebhookAsync(clientId, events['messages.upsert'].messages);
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
        // Check if this is a manual disconnection
        if (this.manualDisconnections.has(clientId)) {
            console.log(`Client ${clientId} was manually disconnected. Not attempting reconnection.`);
            return;
        }
        const attempts = this.reconnectAttempts.get(clientId) || 0;
        this.reconnectAttempts.set(clientId, attempts + 1);
        // Exponential backoff: 2^n seconds, max 5 minutes
        const delaySeconds = Math.min(Math.pow(2, attempts), 300);
        io.to(clientId).emit('statusChange', {
            status: 'RECONNECTING',
            message: `Reconnecting in ${delaySeconds} seconds... (attempt ${attempts + 1})`
        });
        // Only log every 5th attempt to reduce spam
        if (attempts % 5 === 0 || attempts === 1) {
            console.log(`Reconnecting client ${clientId} in ${delaySeconds}s (attempt ${attempts + 1})`);
        }
        // Max 20 reconnect attempts (increased for better persistence)
        if (attempts >= 20) {
            console.log(`Max reconnection attempts reached for client ${clientId}. Will retry in 1 hour.`);
            io.to(clientId).emit('statusChange', {
                status: 'DISCONNECTED',
                message: 'Maximum reconnection attempts reached. Will retry after 1 hour.'
            });
            await client_model_1.default.findByIdAndUpdate(clientId, { status: 'DISCONNECTED' });
            // Reset attempts and try again after 1 hour
            setTimeout(() => {
                this.reconnectAttempts.delete(clientId);
                this.reconnectWithBackoff(clientId, io);
            }, 3600000); // 1 hour
            return;
        }
        // Set status to reconnecting in database
        await client_model_1.default.findByIdAndUpdate(clientId, { status: 'RECONNECTING' });
        setTimeout(async () => {
            try {
                // Only log on first few attempts
                if ((this.reconnectAttempts.get(clientId) || 0) <= 3) {
                    console.log(`Reconnecting client ${clientId}...`);
                }
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
    // Method to check if a client should be reconnected
    shouldReconnect(clientId) {
        return !this.manualDisconnections.has(clientId) && !this.disconnectedClients.has(clientId);
    }
    // Method to force reconnection for a client
    async forceReconnect(clientId) {
        console.log(`Force reconnecting client ${clientId}...`);
        // Clear any existing reconnection attempts
        this.reconnectAttempts.delete(clientId);
        // Disconnect existing client if it exists
        const existingClient = this.clients.get(clientId);
        if (existingClient) {
            try {
                await existingClient.end(new boom_1.Boom('Force Reconnect', { statusCode: baileys_1.DisconnectReason.connectionClosed }));
            }
            catch (error) {
                console.error(`Error ending existing client ${clientId}:`, error);
            }
            this.clients.delete(clientId);
        }
        // Remove from manual disconnections to allow reconnection
        this.manualDisconnections.delete(clientId);
        // Initialize new client
        const io = socket_service_1.default.getIO();
        await this.initializeClient(clientId);
        io.to(clientId).emit('statusChange', { status: 'INITIALIZING' });
    }
    // Method to get connection status
    getConnectionStatus(clientId) {
        const client = this.clients.get(clientId);
        const isConnected = !!client;
        const isAuthenticated = !!(client && client.user);
        let status = 'DISCONNECTED';
        if (isAuthenticated) {
            status = 'AUTHENTICATED';
        }
        else if (isConnected) {
            status = 'INITIALIZING';
        }
        return {
            isConnected,
            isAuthenticated,
            isManualDisconnect: this.manualDisconnections.has(clientId),
            reconnectAttempts: this.reconnectAttempts.get(clientId) || 0,
            status
        };
    }
    // Method to perform health check on all clients
    async performHealthCheck() {
        // Only log if there are issues or changes
        let healthyCount = 0;
        let unhealthyCount = 0;
        for (const [clientId, client] of this.clients.entries()) {
            try {
                // Check if client is still responsive and authenticated
                if (client && client.user) {
                    healthyCount++;
                    // Ensure database status reflects the actual connection state
                    await this.syncClientStatus(clientId, 'AUTHENTICATED');
                }
                else {
                    unhealthyCount++;
                    console.log(`Client ${clientId} appears unhealthy, attempting reconnection...`);
                    await this.forceReconnect(clientId);
                }
            }
            catch (error) {
                console.error(`Health check failed for client ${clientId}:`, error);
                // Attempt reconnection for failed health checks
                if (this.shouldReconnect(clientId)) {
                    await this.forceReconnect(clientId);
                }
            }
        }
        // Only log summary if there are clients or issues
        if (healthyCount > 0 || unhealthyCount > 0) {
            console.log(`Health check completed: ${healthyCount} healthy, ${unhealthyCount} unhealthy clients`);
        }
        // Also check for clients in database that are marked as connected but not in memory
        await this.syncDisconnectedClients();
    }
    // Method to sync client status in database with actual connection state
    async syncClientStatus(clientId, status) {
        try {
            const currentData = await client_model_1.default.findById(clientId);
            if (currentData && currentData.status !== status) {
                console.log(`Syncing status for client ${clientId}: ${currentData.status} -> ${status}`);
                await client_model_1.default.findByIdAndUpdate(clientId, { status });
            }
        }
        catch (error) {
            console.error(`Failed to sync status for client ${clientId}:`, error);
        }
    }
    // Method to check for clients marked as connected in DB but not in memory
    async syncDisconnectedClients() {
        try {
            // Find clients marked as AUTHENTICATED or INITIALIZING in database
            const dbClients = await client_model_1.default.find({
                status: { $in: ['AUTHENTICATED', 'INITIALIZING', 'RECONNECTING'] }
            });
            for (const dbClient of dbClients) {
                const clientId = dbClient._id.toString();
                const memoryClient = this.clients.get(clientId);
                // If client is marked as connected in DB but not in memory, mark as disconnected
                if (!memoryClient) {
                    console.log(`Client ${clientId} marked as ${dbClient.status} in DB but not in memory. Setting to DISCONNECTED.`);
                    await client_model_1.default.findByIdAndUpdate(clientId, { status: 'DISCONNECTED' });
                }
            }
        }
        catch (error) {
            console.error('Failed to sync disconnected clients:', error);
        }
    }
    // Method to manually sync all client statuses
    async syncAllClientStatuses() {
        console.log('Manually syncing all client statuses...');
        // Sync connected clients
        for (const [clientId, client] of this.clients.entries()) {
            try {
                if (client && client.user) {
                    await this.syncClientStatus(clientId, 'AUTHENTICATED');
                }
                else {
                    await this.syncClientStatus(clientId, 'INITIALIZING');
                }
            }
            catch (error) {
                console.error(`Failed to sync status for client ${clientId}:`, error);
            }
        }
        // Sync disconnected clients
        await this.syncDisconnectedClients();
        console.log('Client status synchronization completed.');
    }
    // Method to start periodic health checks
    startHealthChecks(intervalMinutes = 5) {
        // Only log once at startup
        console.log(`Health checks enabled (${intervalMinutes}min intervals)`);
        setInterval(() => {
            this.performHealthCheck();
        }, intervalMinutes * 60 * 1000);
    }
    // Non-blocking webhook processing using centralized webhook service
    async processWebhookAsync(clientId, messages, clientData, userAtReceipt) {
        // Process webhook in background without blocking
        setImmediate(async () => {
            try {
                // Starting webhook processing
                // Use the clientData passed to this function
                for (const message of messages) {
                    // Processing message
                    if (message.key.fromMe || message.key.remoteJid === 'status@broadcast') {
                        // Skipping message
                        continue;
                    }
                    let user = null;
                    // Respect user status snapshot at message receipt to avoid race with onboarding activation
                    const isActiveAtReceipt = userAtReceipt && userAtReceipt.status === 'ACTIVE';
                    // For translate clients, get user data
                    if (clientData.client_type === 'translate') {
                        const remoteJid = message.key?.remoteJid;
                        const phoneNumber = remoteJid ? parseInt(remoteJid.split('@')[0]) : null;
                        if (phoneNumber && !isNaN(phoneNumber)) {
                            // If snapshot says not active, skip immediately
                            if (!isActiveAtReceipt) {
                                console.log(`Skipping message for inactive/missing user ${phoneNumber}`);
                                continue;
                            }
                            // Optionally refresh user for payload fields
                            user = userAtReceipt || await user_model_1.default.findOne({ wa_num: phoneNumber }).lean();
                        }
                    }
                    // For chatbot clients, get user data for first_name and context
                    if (clientData.client_type === 'chatbot') {
                        const remoteJid = message.key?.remoteJid;
                        const phoneNumber = remoteJid ? parseInt(remoteJid.split('@')[0]) : null;
                        if (phoneNumber && !isNaN(phoneNumber)) {
                            // If snapshot says not active, skip immediately
                            if (!isActiveAtReceipt) {
                                console.log(`Skipping message for inactive/missing user ${phoneNumber}`);
                                continue;
                            }
                            // Optionally refresh user for payload fields
                            user = userAtReceipt || await user_model_1.default.findOne({ wa_num: phoneNumber }).lean();
                        }
                    }
                    // Use universal webhook service for both client types
                    // This ensures audio messages and all message types are handled consistently
                    console.log(`Processing ${clientData.client_type} webhook for message from ${message.key?.remoteJid}`);
                    try {
                        await webhook_service_1.default.sendMessageWebhookUnified(message, clientId, clientData.client_type, user);
                    }
                    catch (webhookError) {
                        console.error(`Error sending webhook:`, webhookError);
                    }
                }
            }
            catch (error) {
                console.error(`Error processing webhook for client ${clientId}:`, error);
            }
        });
    }
    // Method to gracefully shutdown all clients
    async shutdown() {
        console.log('Shutting down all clients...');
        for (const [clientId, client] of this.clients.entries()) {
            try {
                if (client) {
                    await client.end(new boom_1.Boom('Server Shutdown', { statusCode: baileys_1.DisconnectReason.connectionClosed }));
                }
            }
            catch (error) {
                console.error(`Error shutting down client ${clientId}:`, error);
            }
        }
        this.clients.clear();
        this.manualDisconnections.clear();
        this.reconnectAttempts.clear();
        this.qrRetryCount.clear();
        this.disconnectedClients.clear();
        console.log('All clients have been shut down.');
    }
}
exports.default = ClientService.getInstance();
