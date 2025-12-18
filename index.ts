import { Client, LocalAuth, Message, MessageMedia } from 'whatsapp-web.js';
import { unlinkSync, existsSync, readdirSync, mkdirSync } from 'fs';
import { join } from 'path';

let client: Client | null = null;
let isShuttingDown = false;
let isReady = false;
let initializationAttempt = 0;
const MAX_RETRIES = parseInt(process.env.MAX_RETRIES || '5');
const BASE_RETRY_DELAY = parseInt(process.env.BASE_RETRY_DELAY || '5000');
const AUTH_DIR = process.env.AUTH_DIR || '/app/.wwebjs_auth';
const CACHE_DIR = process.env.CACHE_DIR || '/app/.wwebjs_cache';

function cleanChromiumLocks(dir: string) {
    if (!existsSync(dir)) {
        console.log(`Creating auth directory: ${dir}`);
        mkdirSync(dir, { recursive: true });
        return;
    }

    const lockPatterns = ['SingletonLock', 'SingletonSocket', 'SingletonCookie'];

    try {
        const entries = readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = join(dir, entry.name);

            if (entry.isDirectory()) {
                cleanChromiumLocks(fullPath);
            } else if (lockPatterns.some(pattern => entry.name.includes(pattern))) {
                console.log(`Removing stale lock: ${entry.name} from ${dir}`);
                try {
                    unlinkSync(fullPath);
                } catch (err) {
                    console.warn(`Failed to remove ${entry.name}:`, err);
                }
            }
        }
    } catch (error) {
        console.warn(`Error cleaning locks in ${dir}:`, error);
    }
}

async function gracefulShutdown(signal: string) {
    if (isShuttingDown) {
        console.log('Shutdown already in progress...');
        return;
    }

    isShuttingDown = true;
    console.log(`\nReceived ${signal}, shutting down gracefully...`);

    if (client) {
        try {
            console.log('Destroying client...');
            await Promise.race([
                client.destroy(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Destroy timeout')), 5000))
            ]);
            console.log('Client destroyed successfully');
        } catch (error) {
            console.error('Error destroying client:', error);
        }
    }

    console.log('Cleanup complete, exiting...');
    process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
    gracefulShutdown('uncaughtException');
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled rejection at:', promise, 'reason:', reason);
});

function createClient(): Client {
    console.log('Creating WhatsApp client...');
    const newClient = new Client({
        authStrategy: new LocalAuth(),
        puppeteer: {
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu',
                '--disable-software-rasterizer',
                '--disable-extensions',
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
                '--disable-renderer-backgrounding'
            ],
            headless: true,
            timeout: 120000
        }
    });
    console.log('Client created successfully');
    return newClient;
}

interface ZodiacSign {
    emoji: string;
    patterns: string[];
    compiledRegex: RegExp;
}

const zodiacSigns: ZodiacSign[] = [
    { emoji: '♈', patterns: ['aries'], compiledRegex: /\b(aries)\b/i },
    { emoji: '♉', patterns: ['tauro', 'tauros'], compiledRegex: /\b(tauros?)\b/i },
    { emoji: '♊', patterns: ['géminis', 'geminis', 'gémini', 'gemini'], compiledRegex: /\b(g[eé]minis?)\b/i },
    { emoji: '♋', patterns: ['cáncer', 'cancer'], compiledRegex: /\b(c[aá]ncer)\b/i },
    { emoji: '♌', patterns: ['leo', 'leos'], compiledRegex: /\b(leos?)\b/i },
    { emoji: '♍', patterns: ['virgo', 'virgos'], compiledRegex: /\b(virgos?)\b/i },
    { emoji: '♎', patterns: ['libra', 'libras'], compiledRegex: /\b(libras?)\b/i },
    { emoji: '♏', patterns: ['escorpio', 'escorpión', 'escorpion', 'escorpios'], compiledRegex: /\b(escorpi[oó]n?(?:es)?|escorpios?)\b/i },
    { emoji: '♐', patterns: ['sagitario', 'sagitarios'], compiledRegex: /\b(sagitarios?)\b/i },
    { emoji: '♑', patterns: ['capricornio', 'capricornios'], compiledRegex: /\b(capricornios?)\b/i },
    { emoji: '♒', patterns: ['acuario', 'acuarios'], compiledRegex: /\b(acuarios?)\b/i },
    { emoji: '♓', patterns: ['piscis'], compiledRegex: /\b(piscis)\b/i }
];

function normalizeText(text: string): string {
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

function getMexicoCityTime(): string {
    return new Date().toLocaleString('es-MX', {
        timeZone: 'America/Mexico_City',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
}

async function logMessage(msg: Message, type: 'RECIBIDO' | 'ENVIADO') {
    try {
        let name = 'Unknown';
        const number = msg.from || 'Unknown';
        const time = getMexicoCityTime();

        try {
            const contact = await msg.getContact();
            name = contact.pushname || contact.name || 'Sin nombre';
        } catch (contactError) {
            // WhatsApp Web API changed - getContact may fail
            // Fall back to using the number as the name
            name = number;
        }

        let messageContent = msg.body;

        if (!messageContent || messageContent.trim() === '') {
            if (msg.hasMedia) {
                messageContent = `[${msg.type.toUpperCase()}]`;
            } else {
                return;
            }
        }

        console.log(`[${time}] [${type}] ${name} (${number}): ${messageContent}`);
    } catch (error) {
        // Don't let logging errors crash the bot
        console.error('Error logging message:', error);
    }
}

function detectZodiacSigns(text: string): string[] {
    const foundEmojis = new Set<string>();
    const matches: Array<{ emoji: string; index: number }> = [];

    for (const sign of zodiacSigns) {
        let match: RegExpExecArray | null;
        const regex = new RegExp(sign.compiledRegex.source, 'gi');

        while ((match = regex.exec(text)) !== null) {
            if (!foundEmojis.has(sign.emoji)) {
                matches.push({ emoji: sign.emoji, index: match.index });
                foundEmojis.add(sign.emoji);
            }
        }
    }

    return matches
        .sort((a, b) => a.index - b.index)
        .map(m => m.emoji);
}

async function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function initializeWithRetry(): Promise<void> {
    while (initializationAttempt < MAX_RETRIES && !isShuttingDown) {
        initializationAttempt++;

        try {
            console.log(`\n=== Initialization attempt ${initializationAttempt}/${MAX_RETRIES} ===`);

            console.log('Cleaning Chromium profile locks...');
            cleanChromiumLocks(AUTH_DIR);
            cleanChromiumLocks(CACHE_DIR);
            console.log('Lock cleanup complete');

            if (client) {
                console.log('Destroying previous client instance...');
                try {
                    await client.destroy();
                } catch (e) {
                    console.warn('Error destroying previous client:', e);
                }
                client = null;
            }

            await sleep(2000);

            client = createClient();

            setupClientEventHandlers(client);

            console.log('Initializing WhatsApp client...');
            await Promise.race([
                client.initialize(),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Initialization timeout after 3 minutes')), 180000)
                )
            ]);

            console.log('✓ Initialize complete - client is running');
            return;

        } catch (error: any) {
            console.error(`✗ Initialization attempt ${initializationAttempt} failed:`, error?.message || error);

            if (initializationAttempt < MAX_RETRIES && !isShuttingDown) {
                const delay = BASE_RETRY_DELAY * Math.pow(2, initializationAttempt - 1);
                console.log(`Retrying in ${delay / 1000} seconds...`);
                await sleep(delay);
            } else {
                console.error('Maximum retry attempts reached or shutting down');
                process.exit(1);
            }
        }
    }
}

function setupClientEventHandlers(client: Client) {
    client.on('loading_screen', (percent, message) => {
        console.log(`Loading: ${percent}% - ${message}`);
    });

    client.on('qr', (qr) => {
        console.log('QR RECEIVED');
        console.log(qr);
    });

    client.on('ready', () => {
        console.log('✓ Client is ready!');
        isReady = true;
        initializationAttempt = 0;
    });

    client.on('message', async (msg) => {
        await logMessage(msg, 'RECIBIDO');

        if (!msg.body || msg.body.trim() === '') {
            return;
        }

        if (msg.body === '!ping') {
            await msg.reply('pong');
            return;
        }

        const zodiacEmojis = detectZodiacSigns(msg.body);
        if (zodiacEmojis.length > 0) {
            await msg.reply(zodiacEmojis.join(' '));
        }
    });

    client.on('message_create', async (msg) => {
        if (msg.fromMe) {
            await logMessage(msg, 'ENVIADO');
        }
    });

    client.on('message_ack', async (msg, ack) => {
        // ack: 0=pending, 1=server, 2=delivered, 3=read, 4=played
        if (ack === 3) {
            const time = getMexicoCityTime();
            const to = msg.to || 'Unknown';
            const preview = msg.body?.substring(0, 50) || '[media]';
            console.log(`[${time}] [LEÍDO] ${to}: ${preview}${msg.body?.length > 50 ? '...' : ''}`);
        }
    });

    client.on('authenticated', () => {
        console.log('✓ AUTHENTICATED');
    });

    client.on('auth_failure', (msg) => {
        console.log('✗ AUTHENTICATION FAILURE:', msg);
    });

    client.on('disconnected', async (reason) => {
        console.log('✗ Client was logged out:', reason);
        isReady = false;

        if (!isShuttingDown && initializationAttempt < MAX_RETRIES) {
            console.log('Attempting to reconnect...');
            await sleep(5000);
            await initializeWithRetry();
        }
    });
}

initializeWithRetry().catch(error => {
    console.error('Fatal error during initialization:', error);
    process.exit(1);
});

// HTTP Server for API endpoints
const PORT = parseInt(process.env.PORT || '3000');

const server = Bun.serve({
    port: PORT,
    async fetch(request: Request): Promise<Response> {
        const url = new URL(request.url);

        // Health check endpoint
        if (url.pathname === '/health') {
            return new Response(JSON.stringify({
                status: 'ok',
                whatsapp: isReady ? 'connected' : 'disconnected'
            }), {
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Send message endpoint
        if (url.pathname === '/send' && request.method === 'POST') {
            try {
                const body = await request.json() as { target?: string; message?: string };
                const { target, message } = body;

                if (!target || !message) {
                    return new Response(JSON.stringify({
                        error: 'Missing required fields: target and message'
                    }), {
                        status: 400,
                        headers: { 'Content-Type': 'application/json' }
                    });
                }

                if (!isReady || !client) {
                    return new Response(JSON.stringify({
                        error: 'WhatsApp client not ready. Please scan QR code first.'
                    }), {
                        status: 503,
                        headers: { 'Content-Type': 'application/json' }
                    });
                }

                // Support both individual chats (@c.us) and groups (@g.us)
                let chatId: string;
                if (target.includes('@g.us') || target.includes('@c.us')) {
                    // Already formatted chat ID
                    chatId = target;
                } else if (target.length > 15 && /^\d+$/.test(target)) {
                    // Long numeric ID = group
                    chatId = `${target}@g.us`;
                } else {
                    // Phone number = individual chat
                    const cleanNumber = target.replace(/\D/g, '');
                    chatId = `${cleanNumber}@c.us`;
                }

                const result = await client.sendMessage(chatId, message);

                return new Response(JSON.stringify({
                    success: true,
                    messageId: result.id._serialized,
                    to: target,
                    message: message
                }), {
                    headers: { 'Content-Type': 'application/json' }
                });

            } catch (error: any) {
                console.error('Error sending message:', error);
                return new Response(JSON.stringify({
                    error: 'Failed to send message',
                    details: error?.message || 'Unknown error'
                }), {
                    status: 500,
                    headers: { 'Content-Type': 'application/json' }
                });
            }
        }

        // Send message to group endpoint
        if (url.pathname === '/send-group' && request.method === 'POST') {
            try {
                const body = await request.json() as { groupId?: string; message?: string };
                const { groupId, message } = body;

                if (!groupId || !message) {
                    return new Response(JSON.stringify({
                        error: 'Missing required fields: groupId and message'
                    }), {
                        status: 400,
                        headers: { 'Content-Type': 'application/json' }
                    });
                }

                if (!isReady || !client) {
                    return new Response(JSON.stringify({
                        error: 'WhatsApp client not ready. Please scan QR code first.'
                    }), {
                        status: 503,
                        headers: { 'Content-Type': 'application/json' }
                    });
                }

                // Format: groupId@g.us
                const chatId = groupId.includes('@g.us') ? groupId : `${groupId}@g.us`;

                console.log(`Sending message to group: ${chatId}`);
                const result = await client.sendMessage(chatId, message);

                return new Response(JSON.stringify({
                    success: true,
                    messageId: result.id._serialized,
                    to: chatId,
                    message: message
                }), {
                    headers: { 'Content-Type': 'application/json' }
                });

            } catch (error: any) {
                console.error('Error sending group message:', error);
                return new Response(JSON.stringify({
                    error: 'Failed to send group message',
                    details: error?.message || 'Unknown error'
                }), {
                    status: 500,
                    headers: { 'Content-Type': 'application/json' }
                });
            }
        }

        // Send PDF catalog endpoint
        if (url.pathname === '/send-pdf' && request.method === 'POST') {
            try {
                const body = await request.json() as { target?: string; caption?: string };
                const { target, caption } = body;

                if (!target) {
                    return new Response(JSON.stringify({
                        error: 'Missing required field: target'
                    }), {
                        status: 400,
                        headers: { 'Content-Type': 'application/json' }
                    });
                }

                if (!isReady || !client) {
                    return new Response(JSON.stringify({
                        error: 'WhatsApp client not ready. Please scan QR code first.'
                    }), {
                        status: 503,
                        headers: { 'Content-Type': 'application/json' }
                    });
                }

                // Support both individual chats (@c.us) and groups (@g.us)
                let chatId: string;
                if (target.includes('@g.us') || target.includes('@c.us')) {
                    chatId = target;
                } else if (target.length > 15 && /^\d+$/.test(target)) {
                    chatId = `${target}@g.us`;
                } else {
                    const cleanNumber = target.replace(/\D/g, '');
                    chatId = `${cleanNumber}@c.us`;
                }

                const pdfPath = join(import.meta.dir, 'GFB Catálogo.pdf');

                if (!existsSync(pdfPath)) {
                    return new Response(JSON.stringify({
                        error: 'PDF file not found',
                        path: pdfPath
                    }), {
                        status: 500,
                        headers: { 'Content-Type': 'application/json' }
                    });
                }

                const media = MessageMedia.fromFilePath(pdfPath);

                console.log(`Sending PDF to: ${chatId}`);
                const result = await client.sendMessage(chatId, media, {
                    caption: caption || ''
                });

                return new Response(JSON.stringify({
                    success: true,
                    messageId: result.id._serialized,
                    to: target,
                    filename: 'GFB Catálogo.pdf'
                }), {
                    headers: { 'Content-Type': 'application/json' }
                });

            } catch (error: any) {
                console.error('Error sending PDF:', error);
                return new Response(JSON.stringify({
                    error: 'Failed to send PDF',
                    details: error?.message || 'Unknown error'
                }), {
                    status: 500,
                    headers: { 'Content-Type': 'application/json' }
                });
            }
        }

        // 404 for other routes
        return new Response(JSON.stringify({
            error: 'Not found',
            endpoints: {
                'GET /health': 'Check server and WhatsApp status',
                'POST /send': 'Send WhatsApp message (body: { target, message })',
                'POST /send-group': 'Send message to group (body: { groupId, message })',
                'POST /send-pdf': 'Send PDF catalog (body: { target, caption? })'
            }
        }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' }
        });
    }
});

console.log(`Server running at http://localhost:${server.port}`);