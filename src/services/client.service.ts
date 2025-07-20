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
            const emitEvent = (type: keyof BaileysEventMap, data: any) => {
                io.to(clientId).emit('messageEvent', { type, data });
            };

            if (events['connection.update']) {
                const update = events['connection.update'];
                emitEvent('connection.update', update);
                const { connection, lastDisconnect, qr } = update;

                if (qr) {
                    console.log(`QR RECEIVED for ${clientId}`);
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
                    const status = (statusCode === DisconnectReason.loggedOut || statusCode === DisconnectReason.connectionClosed) ? 'DISCONNECTED' : 'SYNCING';
                    io.to(clientId).emit('statusChange', { status });

                    if (statusCode === DisconnectReason.connectionClosed) {
                        console.log(`Connection closed manually for ${clientId}. Not reconnecting.`);
                    } else if (statusCode !== DisconnectReason.loggedOut) {
                        console.log(`Syncing client ${clientId}...`);
                        this.initializeClient(clientId);
                    } else {
                        console.log(`Connection closed for ${clientId}. You are logged out.`);
                        this.clients.delete(clientId);
                        await ClientData.updateOne({ clientId }, { status: 'DISCONNECTED' });
                    }
                }

                if(connection === 'open') {
                    console.log(`Client ${clientId} connected!`);
                    io.to(clientId).emit('statusChange', { status: 'AUTHENTICATED' });

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

export default ClientService.getInstance(); 