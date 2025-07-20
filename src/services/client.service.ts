import makeWASocket, {
    fetchLatestBaileysVersion,
    isJidNewsletter,
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

const useMongoDBAuthState = async (clientId: string): Promise<{ state: { creds: AuthenticationCreds, keys: SignalKeyStore }, saveCreds: () => Promise<void> }> => {
    const client = await ClientData.findOne({ clientId }).lean();

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
            await ClientData.updateOne({ clientId }, { $set: { session: session } });
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
            await sock.end(new Boom('Manual Disconnect', { statusCode: DisconnectReason.connectionClosed }));
            this.clients.delete(clientId);
            await ClientData.updateOne({ clientId }, { status: 'DISCONNECTED' });
        }
    }

    public async logoutClient(clientId: string): Promise<void> {
        const sock = this.clients.get(clientId);
        if (sock) {
            console.log(`Logging out client ${clientId}...`);
            await sock.logout();
            this.clients.delete(clientId);
        }
        // Ensure session is cleared from DB regardless of whether the client was in memory
        await ClientData.updateOne({ clientId }, { $set: { session: null, status: 'DISCONNECTED' } });
    }

    public async initializeClient(clientId: string) {
        console.log(`Initializing WhatsApp client for ID: ${clientId}`);

        const msgRetryCounterCache = new NodeCache();
        const logger = pino({ level: 'warn' });
        
        const { state, saveCreds } = await useMongoDBAuthState(clientId);

        const { version, isLatest } = await fetchLatestBaileysVersion();
        console.log(`using WA v${version.join('.')}, isLatest: ${isLatest}`);

        const sock = makeWASocket({
            version,
            logger,
            auth: state,
            msgRetryCounterCache,
            generateHighQualityLinkPreview: true,
            async getMessage(key: WAMessageKey): Promise<WAMessageContent | undefined> {
                return proto.Message.fromObject({});
            }
        });

        this.clients.set(clientId, sock);
        await ClientData.updateOne({ clientId }, { status: 'INITIALIZING' });

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
                    await ClientData.updateOne({ clientId }, { status: 'WAITING_QR' });
                }

                if (connection === 'close') {
                    const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
                    const errorCode = (lastDisconnect?.error as any)?.output?.payload?.['stream:error']?.['@attrs']?.code;
                    
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
                        await ClientData.updateOne({ clientId }, { status: 'DISCONNECTED' });
                    } else if (statusCode === DisconnectReason.loggedOut) {
                        console.log(`Connection closed for ${clientId}. You are logged out.`);
                        io.to(clientId).emit('statusChange', { status: 'DISCONNECTED' });
                        this.clients.delete(clientId);
                        await ClientData.updateOne({ clientId }, { status: 'DISCONNECTED' });
                        this.disconnectedClients.add(clientId);
                    } else if (statusCode === DisconnectReason.connectionClosed) {
                        console.log(`Connection closed manually for ${clientId}. Not reconnecting.`);
                        io.to(clientId).emit('statusChange', { status: 'DISCONNECTED' });
                        this.clients.delete(clientId);
                    } else {
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
                    await ClientData.updateOne({ clientId }, { 
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
            await ClientData.updateOne({ clientId }, { status: 'DISCONNECTED' });
            this.reconnectAttempts.delete(clientId);
            return;
        }
        
        // Set status to reconnecting in database
        await ClientData.updateOne({ clientId }, { status: 'RECONNECTING' });
        
        setTimeout(async () => {
            try {
                console.log(`Attempting to reconnect client ${clientId}...`);
                await this.initializeClient(clientId);
                io.to(clientId).emit('statusChange', { status: 'INITIALIZING' });
            } catch (error) {
                console.error(`Failed to reconnect client ${clientId}:`, error);
                // Try again with backoff
                this.reconnectWithBackoff(clientId, io);
            }
        }, delaySeconds * 1000);
    }
}

export default ClientService.getInstance(); 