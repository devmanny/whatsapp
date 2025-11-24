import { Client, LocalAuth } from 'whatsapp-web.js';

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

client.on('qr', (qr) => {
    console.log('QR RECEIVED');
    console.log(qr);
});

client.on('ready', () => {
    console.log('Client is ready!');
});

client.on('message', async (msg) => {
    console.log('MESSAGE RECEIVED', msg.body);

    if (msg.body === '!ping') {
        await msg.reply('pong');
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