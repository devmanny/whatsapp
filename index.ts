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
    const contact = await msg.getContact();
    const name = contact.pushname || contact.name || 'Sin nombre';
    const number = msg.from;
    const time = getMexicoCityTime();

    console.log(`[${time}] [${type}] ${name} (${number}): ${msg.body}`);
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