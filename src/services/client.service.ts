import makeWASocket, {
    fetchLatestBaileysVersion,
    DisconnectReason,
    proto,
    WAMessageContent,
    WAMessageKey,
    BaileysEventMap,
    AuthenticationCreds,
    SignalKeyStore,
    initAuthCreds,
    BufferJSON,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import { Boom } from '@hapi/boom';
import NodeCache from '@cacheable/node-cache';
import qrcodeTerminal from 'qrcode-terminal';
import qrcode from 'qrcode';
import ClientData from '../models/client.model';
import socketService from './socket.service';
import userService from './user.service';
import logger from '../utils/logger.util';

const useMongoDBAuthState = async (clientId: string): Promise<{ state: { creds: AuthenticationCreds, keys: SignalKeyStore }, saveCreds: () => Promise<void> }> => {
    const client = await ClientData.findById(clientId).lean();

    let creds: AuthenticationCreds;
    if (client && client.session && client.session.creds) {
        creds = JSON.parse(JSON.stringify(client.session.creds), BufferJSON.reviver);
    } else {
        creds = initAuthCreds();
    }
    
    const keys: { [key: string]: any } = client?.session?.keys || {};

    const saveCreds = async () => {
        const session = { 
            creds: JSON.parse(JSON.stringify(creds, BufferJSON.replacer)), 
            keys 
        };
        try {
            await ClientData.findByIdAndUpdate(clientId, { $set: { session: session } });
        } catch (error) {
            console.error('Failed to save auth state to MongoDB', error);
        }
    };

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data: { [key: string]: any } = {};
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
                        const typeData = data[type as keyof typeof data];
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
    private clients: Map<string, any> = new Map();
    private static instance: ClientService;
    private qrRetryCount = new Map<string, number>();
    private disconnectedClients = new Set<string>();
    private reconnectAttempts = new Map<string, number>();
    private manualDisconnections = new Set<string>(); // Track manual disconnections

    public static getInstance(): ClientService {
        if (!ClientService.instance) {
            ClientService.instance = new ClientService();
        }
        return ClientService.instance;
    }

    public getClient(clientId: string) {
        return this.clients.get(clientId);
    }

    public async disconnectClient(clientId: string): Promise<void> {
        const sock = this.clients.get(clientId);
        if (sock) {
            console.log(`Disconnecting client ${clientId}...`);
            // Mark as manual disconnection
            this.manualDisconnections.add(clientId);
            await sock.end(new Boom('Manual Disconnect', { statusCode: DisconnectReason.connectionClosed }));
            this.clients.delete(clientId);
            await ClientData.findByIdAndUpdate(clientId, { status: 'DISCONNECTED' });
        }
    }

    public async logoutClient(clientId: string): Promise<void> {
        const sock = this.clients.get(clientId);
        if (sock) {
            console.log(`Logging out client ${clientId}...`);
            // Mark as manual disconnection
            this.manualDisconnections.add(clientId);
            await sock.logout();
            this.clients.delete(clientId);
        }
        // Ensure session is cleared from DB regardless of whether the client was in memory
        await ClientData.findByIdAndUpdate(clientId, { $set: { session: null, status: 'DISCONNECTED' } });
    }

    public async initializeClient(clientId: string) {
        logger.info(`Initializing WhatsApp client for ID: ${clientId}`);

        const msgRetryCounterCache = new NodeCache();
        const pinoLogger = pino({ level: 'silent' }); // Changed from 'warn' to 'silent' to reduce logs
        
        const { state, saveCreds } = await useMongoDBAuthState(clientId);

        const { version, isLatest } = await fetchLatestBaileysVersion();
        // Only log version if it's not the latest
        if (!isLatest) {
            console.log(`Using WA v${version.join('.')}, isLatest: ${isLatest}`);
        }

        const sock = makeWASocket({
            version,
            logger: pinoLogger,
            auth: state,
            msgRetryCounterCache,
            generateHighQualityLinkPreview: true,
            async getMessage(_key: WAMessageKey): Promise<WAMessageContent | undefined> {
                return proto.Message.fromObject({});
            }
        });

        this.clients.set(clientId, sock);
        await ClientData.findByIdAndUpdate(clientId, { status: 'INITIALIZING' });

        this.setupEventListeners(sock, clientId, saveCreds);

        return sock;
    }

    private setupEventListeners(sock: any, clientId: string, saveCreds: () => Promise<void>) {
        const io = socketService.getIO();

        sock.ev.process(async (events: Partial<BaileysEventMap>) => {
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
                    qrcodeTerminal.generate(qr, { small: true });
                    // Generate data URL for websocket
                    const qrCodeDataURL = await qrcode.toDataURL(qr);
                    io.to(clientId).emit('qr', { qrCode: qrCodeDataURL });
                    io.to(clientId).emit('statusChange', { status: 'WAITING_QR' });
                    await ClientData.findByIdAndUpdate(clientId, { status: 'WAITING_QR' });
                }

                if (connection === 'close') {
                    const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
                    const errorCode = (lastDisconnect?.error as any)?.output?.payload?.['stream:error']?.['@attrs']?.code;
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
                    
                    if (statusCode === DisconnectReason.connectionReplaced) {
                        console.log(`Connection for ${clientId} was replaced. Not reconnecting.`);
                        io.to(clientId).emit('statusChange', { 
                            status: 'DISCONNECTED', 
                            message: 'Connection replaced by another session.' 
                        });
                        this.clients.delete(clientId);
                        await ClientData.findByIdAndUpdate(clientId, { status: 'DISCONNECTED' });
                    } else if (statusCode === DisconnectReason.loggedOut) {
                        console.log(`Connection closed for ${clientId}. You are logged out.`);
                        io.to(clientId).emit('statusChange', { status: 'DISCONNECTED' });
                        this.clients.delete(clientId);
                        await ClientData.findByIdAndUpdate(clientId, { status: 'DISCONNECTED' });
                        this.disconnectedClients.add(clientId);
                    } else if (statusCode === DisconnectReason.connectionClosed) {
                        if (isManualDisconnect) {
                            console.log(`Connection closed manually for ${clientId}. Not reconnecting.`);
                            io.to(clientId).emit('statusChange', { status: 'DISCONNECTED' });
                            this.clients.delete(clientId);
                            // Clean up manual disconnection tracking
                            this.manualDisconnections.delete(clientId);
                        } else {
                            console.log(`Client ${clientId} disconnected unexpectedly, reconnecting...`);
                            io.to(clientId).emit('statusChange', {
                                status: 'RECONNECTING',
                                message: 'Connection lost. Attempting to reconnect...'
                            });
                            this.clients.delete(clientId);
                            // Start reconnection with backoff
                            this.reconnectWithBackoff(clientId, io);
                        }
                    } else {
                        console.log(`Client ${clientId} disconnected (code: ${statusCode}), reconnecting...`);
                        // Remove the client from the map
                        this.clients.delete(clientId);
                        // Start reconnection with backoff
                        this.reconnectWithBackoff(clientId, io);
                    }
                }

                if (connection === 'open') {
                    logger.success(`Client ${clientId} authenticated successfully`);
                    io.to(clientId).emit('statusChange', { status: 'AUTHENTICATED' });
                    this.qrRetryCount.delete(clientId);
                    this.reconnectAttempts.delete(clientId);
                    this.disconnectedClients.delete(clientId);
                    this.manualDisconnections.delete(clientId); // Clean up manual disconnection tracking

                    const { id, name } = sock.user;
                    const phoneNumber = id.split(':')[0];
                    await ClientData.findByIdAndUpdate(clientId, { 
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
                if (this.disconnectedClients.has(clientId)) return;
                io.to(clientId).emit('messages', { type: 'messages.upsert', data: events['messages.upsert'] });
                
                // Process incoming messages for activation codes
                if (events['messages.upsert'].type === 'notify' && 
                    Array.isArray(events['messages.upsert'].messages)) {
                    for (const message of events['messages.upsert'].messages) {
                        try {
                            // Process each message for activation codes
                            await userService.processIncomingMessage(message, clientId);
                        } catch (error) {
                            console.error('Error processing message for activation:', error);
                        }
                    }
                }
            }
            
            if (events['messages.update']) {
                if (this.disconnectedClients.has(clientId)) return;
                io.to(clientId).emit('messages', { type: 'messages.update', data: events['messages.update'] });
            }
            
            if (events['messages.delete']) {
                if (this.disconnectedClients.has(clientId)) return;
                io.to(clientId).emit('messages', { type: 'messages.delete', data: events['messages.delete'] });
            }
            
            if (events['messages.reaction']) {
                if (this.disconnectedClients.has(clientId)) return;
                io.to(clientId).emit('messages', { type: 'messages.reaction', data: events['messages.reaction'] });
            }
            
            if (events['message-receipt.update']) {
                if (this.disconnectedClients.has(clientId)) return;
                io.to(clientId).emit('messages', { type: 'message-receipt.update', data: events['message-receipt.update'] });
            }
            
            if (events['presence.update']) {
                io.to(clientId).emit('messages', { type: 'presence.update', data: events['presence.update'] });
            }

            if (events['chats.upsert']) {
                if (this.disconnectedClients.has(clientId)) return;
                io.to(clientId).emit('chats', { type: 'chats.upsert', data: events['chats.upsert'] });
            }
            
            if (events['chats.update']) {
                if (this.disconnectedClients.has(clientId)) return;
                io.to(clientId).emit('chats', { type: 'chats.update', data: events['chats.update'] });
            }
            
            if (events['chats.delete']) {
                if (this.disconnectedClients.has(clientId)) return;
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

    private async reconnectWithBackoff(clientId: string, io: any): Promise<void> {
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
            await ClientData.findByIdAndUpdate(clientId, { status: 'DISCONNECTED' });

            // Reset attempts and try again after 1 hour
            setTimeout(() => {
                this.reconnectAttempts.delete(clientId);
                this.reconnectWithBackoff(clientId, io);
            }, 3600000); // 1 hour
            return;
        }
        
        // Set status to reconnecting in database
        await ClientData.findByIdAndUpdate(clientId, { status: 'RECONNECTING' });
        
        setTimeout(async () => {
            try {
                // Only log on first few attempts
                if ((this.reconnectAttempts.get(clientId) || 0) <= 3) {
                    console.log(`Reconnecting client ${clientId}...`);
                }
                await this.initializeClient(clientId);
                io.to(clientId).emit('statusChange', { status: 'INITIALIZING' });
            } catch (error) {
                console.error(`Failed to reconnect client ${clientId}:`, error);
                // Try again with backoff
                this.reconnectWithBackoff(clientId, io);
            }
        }, delaySeconds * 1000);
    }

    // Method to check if a client should be reconnected
    public shouldReconnect(clientId: string): boolean {
        return !this.manualDisconnections.has(clientId) && !this.disconnectedClients.has(clientId);
    }

    // Method to force reconnection for a client
    public async forceReconnect(clientId: string): Promise<void> {
        console.log(`Force reconnecting client ${clientId}...`);
        
        // Clear any existing reconnection attempts
        this.reconnectAttempts.delete(clientId);
        
        // Disconnect existing client if it exists
        const existingClient = this.clients.get(clientId);
        if (existingClient) {
            try {
                await existingClient.end(new Boom('Force Reconnect', { statusCode: DisconnectReason.connectionClosed }));
            } catch (error) {
                console.error(`Error ending existing client ${clientId}:`, error);
            }
            this.clients.delete(clientId);
        }
        
        // Remove from manual disconnections to allow reconnection
        this.manualDisconnections.delete(clientId);
        
        // Initialize new client
        const io = socketService.getIO();
        await this.initializeClient(clientId);
        io.to(clientId).emit('statusChange', { status: 'INITIALIZING' });
    }

    // Method to get connection status
    public getConnectionStatus(clientId: string): {
        isConnected: boolean;
        isAuthenticated: boolean;
        isManualDisconnect: boolean;
        reconnectAttempts: number;
        status: string;
    } {
        const client = this.clients.get(clientId);
        const isConnected = !!client;
        const isAuthenticated = !!(client && client.user);

        let status = 'DISCONNECTED';
        if (isAuthenticated) {
            status = 'AUTHENTICATED';
        } else if (isConnected) {
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
    public async performHealthCheck(): Promise<void> {
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
                } else {
                    unhealthyCount++;
                    console.log(`Client ${clientId} appears unhealthy, attempting reconnection...`);
                    await this.forceReconnect(clientId);
                }
            } catch (error) {
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
    private async syncClientStatus(clientId: string, status: string): Promise<void> {
        try {
            const currentData = await ClientData.findById(clientId);
            if (currentData && currentData.status !== status) {
                console.log(`Syncing status for client ${clientId}: ${currentData.status} -> ${status}`);
                await ClientData.findByIdAndUpdate(clientId, { status });
            }
        } catch (error) {
            console.error(`Failed to sync status for client ${clientId}:`, error);
        }
    }

    // Method to check for clients marked as connected in DB but not in memory
    private async syncDisconnectedClients(): Promise<void> {
        try {
            // Find clients marked as AUTHENTICATED or INITIALIZING in database
            const dbClients = await ClientData.find({
                status: { $in: ['AUTHENTICATED', 'INITIALIZING', 'RECONNECTING'] }
            });

            for (const dbClient of dbClients) {
                const clientId = dbClient._id.toString();
                const memoryClient = this.clients.get(clientId);

                // If client is marked as connected in DB but not in memory, mark as disconnected
                if (!memoryClient) {
                    console.log(`Client ${clientId} marked as ${dbClient.status} in DB but not in memory. Setting to DISCONNECTED.`);
                    await ClientData.findByIdAndUpdate(clientId, { status: 'DISCONNECTED' });
                }
            }
        } catch (error) {
            console.error('Failed to sync disconnected clients:', error);
        }
    }

    // Method to manually sync all client statuses
    public async syncAllClientStatuses(): Promise<void> {
        console.log('Manually syncing all client statuses...');

        // Sync connected clients
        for (const [clientId, client] of this.clients.entries()) {
            try {
                if (client && client.user) {
                    await this.syncClientStatus(clientId, 'AUTHENTICATED');
                } else {
                    await this.syncClientStatus(clientId, 'INITIALIZING');
                }
            } catch (error) {
                console.error(`Failed to sync status for client ${clientId}:`, error);
            }
        }

        // Sync disconnected clients
        await this.syncDisconnectedClients();

        console.log('Client status synchronization completed.');
    }

    // Method to start periodic health checks
    public startHealthChecks(intervalMinutes: number = 5): void {
        // Only log once at startup
        console.log(`Health checks enabled (${intervalMinutes}min intervals)`);
        setInterval(() => {
            this.performHealthCheck();
        }, intervalMinutes * 60 * 1000);
    }

    // Method to gracefully shutdown all clients
    public async shutdown(): Promise<void> {
        console.log('Shutting down all clients...');
        
        for (const [clientId, client] of this.clients.entries()) {
            try {
                if (client) {
                    await client.end(new Boom('Server Shutdown', { statusCode: DisconnectReason.connectionClosed }));
                }
            } catch (error) {
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

export default ClientService.getInstance(); 