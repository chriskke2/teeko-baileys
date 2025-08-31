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
const messaging_service_1 = __importDefault(require("./messaging.service"));
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
                // Only log for 'notify' type messages to reduce noise
                if (events['messages.upsert'].type === 'notify') {
                    console.log(`Processing ${events['messages.upsert'].messages?.length || 0} message(s) for client ${clientId}`);
                }
                // Step 2: WebSocket emission
                if (!this.disconnectedClients.has(clientId)) {
                    io.to(clientId).emit('messages', { type: 'messages.upsert', data: events['messages.upsert'] });
                }
                // Process incoming messages
                if (events['messages.upsert'].type === 'notify' &&
                    Array.isArray(events['messages.upsert'].messages)) {
                    for (const message of events['messages.upsert'].messages) {
                        try {
                            // Skip messages from this client or status broadcasts
                            if (message.key.fromMe || message.key.remoteJid === 'status@broadcast') {
                                continue;
                            }
                            // Step 3: Validate message type (text, image, audio, or private key error)
                            const messageText = message.message?.conversation ||
                                message.message?.extendedTextMessage?.text || '';
                            const audioMessage = message.message?.audioMessage;
                            const imageMessage = message.message?.imageMessage;
                            // Check if message has text, audio, or image content
                            const hasText = messageText && messageText.trim();
                            const hasAudio = audioMessage && audioMessage.url;
                            const hasImage = imageMessage && imageMessage.url;
                            // Check for private key error (messageStubType: 2 with "Incorrect private key length" error)
                            const hasPrivateKeyError = message.messageStubType === 2 &&
                                message.messageStubParameters &&
                                message.messageStubParameters.some(param => typeof param === 'string' && param.includes('Incorrect private key length'));
                            if (!hasText && !hasAudio && !hasImage && !hasPrivateKeyError) {
                                continue; // Skip messages without any content or private key error
                            }
                            // Extract phone number and validate
                            const remoteJid = message.key?.remoteJid;
                            if (!remoteJid || (!remoteJid.includes('@s.whatsapp.net') && !remoteJid.includes('@lid'))) {
                                continue; // Skip non-private messages silently
                            }
                            const phoneNumber = parseInt(remoteJid.split('@')[0]);
                            if (isNaN(phoneNumber)) {
                                continue; // Skip invalid phone numbers silently
                            }
                            // Handle private key error case
                            if (hasPrivateKeyError) {
                                console.log(`Private key error detected for message from ${phoneNumber}`);
                                // Check if user exists
                                let user = await user_model_1.default.findOne({ wa_num: phoneNumber });
                                if (!user) {
                                    // New user with private key error - start onboarding
                                    console.log(`New user ${phoneNumber} with private key error - starting onboarding`);
                                    await this.handleNewUser(phoneNumber, message.pushName || 'User', clientId, remoteJid);
                                }
                                else {
                                    // Existing user with private key error - skip and ignore
                                    console.log(`Existing user ${phoneNumber} with private key error - ignoring message`);
                                }
                                continue; // Exit message processing for private key errors
                            }
                            // Determine message type for logging (normal messages)
                            let messageType = 'text';
                            let logContent = messageText;
                            if (hasAudio) {
                                messageType = 'audio';
                                logContent = 'audio message';
                            }
                            else if (hasImage) {
                                messageType = 'image';
                                logContent = 'image message';
                            }
                            console.log(`Processing ${messageType} from ${phoneNumber}: "${logContent}"`);
                            // Get client data
                            const clientData = await client_model_1.default.findById(clientId);
                            if (!clientData) {
                                console.error(`Client ${clientId} not found in database`);
                                continue;
                            }
                            // Step 4 & 5: Check if user exists
                            let user = await user_model_1.default.findOne({ wa_num: phoneNumber });
                            if (!user) {
                                // Step 4: New user - start onboarding
                                console.log(`New user ${phoneNumber} - starting onboarding`);
                                await this.handleNewUser(phoneNumber, message.pushName || 'User', clientId, remoteJid);
                            }
                            else {
                                // Step 5: Existing user - check status
                                if (user.status === 'ONBOARDING') {
                                    // Continue onboarding - use appropriate method based on how user was created
                                    if (user.created_via_endpoint) {
                                        // User created via endpoint - use endpoint method
                                        await user_service_1.default.processIncomingMessageForOnboarding(message, clientId, { wa_num: phoneNumber, first_name: user.first_name });
                                    }
                                    else {
                                        // User created via traditional flow - use traditional method
                                        await user_service_1.default.processIncomingMessage(message, clientId);
                                    }
                                }
                                else if (user.status === 'ACTIVE') {
                                    // Step 6: Forward to webhook service
                                    await this.forwardToWebhook(clientId, message, clientData, user);
                                }
                                else {
                                    // Handle other statuses (PENDING_ACTIVATION, EXPIRED, etc.)
                                    await user_service_1.default.processIncomingMessage(message, clientId);
                                }
                            }
                        }
                        catch (error) {
                            console.error('Error processing message:', error);
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
    // Method to manually sync all client statuses (disabled to prevent sync messages)
    async syncAllClientStatuses() {
        console.log('Client status synchronization disabled.');
    }
    /**
     * Handle new user - create user and start onboarding
     */
    async handleNewUser(phoneNumber, senderName, clientId, remoteJid) {
        try {
            // Check if user already exists (might have been created via endpoint)
            const existingUser = await user_model_1.default.findOne({ wa_num: phoneNumber }).lean();
            if (existingUser) {
                // If user exists and was created via endpoint, don't overwrite
                if (existingUser.created_via_endpoint) {
                    console.log(`User ${phoneNumber} already exists via endpoint - skipping Baileys overwrite`);
                    // If they're in onboarding, continue the process
                    if (existingUser.status === 'ONBOARDING') {
                        await user_service_1.default.processIncomingMessageForOnboarding({ key: { remoteJid }, pushName: existingUser.first_name }, clientId, { wa_num: phoneNumber, first_name: existingUser.first_name });
                    }
                    return;
                }
                // If user exists but wasn't created via endpoint, update their info
                // Only update if user is not in ACTIVE status
                if (existingUser.status !== 'ACTIVE') {
                    console.log(`Updating existing user ${phoneNumber} with Baileys info`);
                    await user_model_1.default.updateOne({ _id: existingUser._id }, {
                        first_name: senderName ? senderName.split(' ')[0] : existingUser.first_name,
                        status: 'ONBOARDING',
                        current_step: 'gender'
                    });
                    // Send gender onboarding question
                    await messaging_service_1.default.sendOptionsMessage('gender', 'onboarding', clientId, remoteJid);
                }
                return;
            }
            // Extract first name from sender name
            const firstName = senderName ? senderName.split(' ')[0] : '';
            // Create user directly in database with ONBOARDING status
            const newUser = new user_model_1.default({
                wa_num: phoneNumber,
                first_name: firstName,
                status: 'ONBOARDING',
                current_step: null, // Will be set by onboarding service
                text_quota: 1000,
                aud_quota: 100,
                img_quota: 100,
                subscription_start: null,
                subscription_end: null,
                package_id: null,
                code: null,
                created_via_endpoint: false // Flag to indicate traditional flow
            });
            await newUser.save();
            console.log(`+ New user ${phoneNumber} → onboarding (traditional flow)`);
            // Send hardcoded greeting message
            const greetingMessage = `Hi ${firstName || 'there'}. I am Teeko! Let's get you set up with a few quick questions. It only takes 1 minute!`;
            await messaging_service_1.default.sendRawTextMessage(clientId, remoteJid, greetingMessage);
            // Send gender onboarding question immediately
            await messaging_service_1.default.sendOptionsMessage('gender', 'onboarding', clientId, remoteJid);
            // Update user's current step to gender
            await user_model_1.default.updateOne({ _id: newUser._id }, { current_step: 'gender' });
        }
        catch (error) {
            console.error(`Error handling new user ${phoneNumber}:`, error);
        }
    }
    /**
     * Forward message to webhook service based on client type
     */
    async forwardToWebhook(clientId, message, clientData, user) {
        try {
            const remoteJid = message.key?.remoteJid;
            const phoneNumber = parseInt(remoteJid.split('@')[0]);
            // Step 6: Identify client type and forward to appropriate webhook
            const clientType = clientData.client_type === 'translate' ? 'translate' : 'chatbot';
            console.log(`→ ${clientType} webhook for ${phoneNumber}`);
            await webhook_service_1.default.sendMessageWebhookUnified(message, clientId, clientType, user);
        }
        catch (error) {
            console.error('Error forwarding to webhook:', error);
        }
    }
    // Method to start periodic health checks
    startHealthChecks(intervalMinutes = 5) {
        console.log(`Health checks enabled (${intervalMinutes}min intervals) - sync messages disabled`);
        setInterval(() => {
            this.performHealthCheck();
        }, intervalMinutes * 60 * 1000);
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
