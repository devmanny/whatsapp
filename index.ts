import { Client, LocalAuth, Message } from 'whatsapp-web.js';

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
        ]
    }
});

const zodiacSigns: Record<string, string> = {
    'aries': '♈',
    'tauro': '♉',
    'géminis': '♊',
    'geminis': '♊',
    'cáncer': '♋',
    'cancer': '♋',
    'leo': '♌',
    'virgo': '♍',
    'libra': '♎',
    'escorpio': '♏',
    'escorpión': '♏',
    'escorpion': '♏',
    'sagitario': '♐',
    'capricornio': '♑',
    'acuario': '♒',
    'piscis': '♓'
};

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
    const contact = await msg.getContact();
    const name = contact.pushname || contact.name || 'Sin nombre';
    const number = msg.from;
    const time = getMexicoCityTime();

    console.log(`[${time}] [${type}] ${name} (${number}): ${msg.body}`);
}

function detectZodiacSign(text: string): string | null {
    const normalizedText = text.toLowerCase();

    for (const [sign, emoji] of Object.entries(zodiacSigns)) {
        const regex = new RegExp(`\\b${sign}\\b`, 'i');
        if (regex.test(normalizedText)) {
            return emoji;
        }
    }

    return null;
}

client.on('qr', (qr) => {
    console.log('QR RECEIVED');
    console.log(qr);
});

client.on('ready', () => {
    console.log('Client is ready!');
});

client.on('message', async (msg) => {
    await logMessage(msg, 'RECIBIDO');

    if (msg.body === '!ping') {
        await msg.reply('pong');
        return;
    }

    const zodiacEmoji = detectZodiacSign(msg.body);
    if (zodiacEmoji) {
        await msg.reply(zodiacEmoji);
    }
});

client.on('message_create', async (msg) => {
    if (msg.fromMe) {
        await logMessage(msg, 'ENVIADO');
    }
});

client.on('authenticated', () => {
    console.log('AUTHENTICATED');
});

client.on('auth_failure', () => {
    console.log('AUTHENTICATION FAILURE');
});

client.on('disconnected', (reason) => {
    console.log('Client was logged out', reason);
});

console.log('Initializing WhatsApp client...');
client.initialize();