const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

// Initialize WhatsApp client with local authentication to persist session
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
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

let isReady = false;

// Zodiac signs mapping
const zodiacSigns = {
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

// Get Mexico City time for logging
function getMexicoCityTime() {
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

// Log messages with contact info
async function logMessage(msg, type) {
  const contact = await msg.getContact();
  const name = contact.pushname || contact.name || 'Sin nombre';
  const number = msg.from;
  const time = getMexicoCityTime();
  console.log(`[${time}] [${type}] ${name} (${number}): ${msg.body}`);
}

// Detect zodiac sign in text
function detectZodiacSign(text) {
  const normalizedText = text.toLowerCase();
  for (const [sign, emoji] of Object.entries(zodiacSigns)) {
    const regex = new RegExp(`\\b${sign}\\b`, 'i');
    if (regex.test(normalizedText)) {
      return emoji;
    }
  }
  return null;
}

// Generate QR code for authentication
client.on('qr', (qr) => {
  console.log('Scan this QR code with WhatsApp:');
  qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
  isReady = true;
  console.log('WhatsApp client is ready!');
});

client.on('authenticated', () => {
  console.log('WhatsApp client authenticated');
});

client.on('auth_failure', (msg) => {
  console.error('Authentication failed:', msg);
});

client.on('disconnected', (reason) => {
  isReady = false;
  console.log('WhatsApp client disconnected:', reason);
});

// Handle incoming messages - zodiac sign detection
client.on('message', async (msg) => {
  await logMessage(msg, 'RECIBIDO');

  // Ping command
  if (msg.body === '!ping') {
    await msg.reply('pong');
    return;
  }

  // Zodiac sign detection
  const zodiacEmoji = detectZodiacSign(msg.body);
  if (zodiacEmoji) {
    await msg.reply(zodiacEmoji);
  }
});

// Log outgoing messages
client.on('message_create', async (msg) => {
  if (msg.fromMe) {
    await logMessage(msg, 'ENVIADO');
  }
});

// Initialize WhatsApp client
client.initialize();

// Bun HTTP server
const server = Bun.serve({
  port: 3000,
  async fetch(request) {
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
        const body = await request.json();
        const { target, message } = body;

        // Validate required fields
        if (!target || !message) {
          return new Response(JSON.stringify({
            error: 'Missing required fields: target and message'
          }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        // Check if WhatsApp is ready
        if (!isReady) {
          return new Response(JSON.stringify({
            error: 'WhatsApp client not ready. Please scan QR code first.'
          }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        // Format phone number (add @c.us suffix for WhatsApp)
        const cleanNumber = target.replace(/\D/g, '');
        const chatId = `${cleanNumber}@c.us`;

        // Send the message
        const result = await client.sendMessage(chatId, message);

        return new Response(JSON.stringify({
          success: true,
          messageId: result.id._serialized,
          to: target,
          message: message
        }), {
          headers: { 'Content-Type': 'application/json' }
        });

      } catch (error) {
        console.error('Error sending message:', error);
        return new Response(JSON.stringify({
          error: 'Failed to send message',
          details: error.message
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
        'POST /send': 'Send WhatsApp message (body: { target, message })'
      }
    }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});

console.log(`Server running at http://localhost:${server.port}`);
console.log('Waiting for WhatsApp authentication...');
