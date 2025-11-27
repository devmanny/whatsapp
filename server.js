const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

// Initialize WhatsApp client with local authentication to persist session
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  }
});

let isReady = false;

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
        // Remove any non-numeric characters and add country code if needed
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
