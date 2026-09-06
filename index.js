const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

let currentQR = '';
let isConnected = false;

// Initialize WhatsApp Client with LocalAuth to persist session
const client = new Client({
    authStrategy: new LocalAuth({ dataPath: '/app/.wwebjs_auth' }),
    puppeteer: {
        headless: true,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process', 
            '--disable-gpu'
        ]
    }
});

client.on('qr', (qr) => {
    console.log('QR RECEIVED');
    currentQR = qr;
});

client.on('ready', () => {
    console.log('Client is ready!');
    isConnected = true;
    currentQR = '';
});

client.on('authenticated', () => {
    console.log('Authenticated!');
});

client.on('auth_failure', (msg) => {
    console.error('Auth failure', msg);
    isConnected = false;
    currentQR = '';
});

client.on('disconnected', (reason) => {
    console.log('Client was logged out', reason);
    isConnected = false;
    currentQR = '';
    client.initialize(); // Re-initialize to get a new QR code
});

client.initialize();

// API Endpoints
app.get('/api/status', (req, res) => {
    res.json({ connected: isConnected });
});

app.get('/api/qr', async (req, res) => {
    if (isConnected) {
        return res.json({ status: 'connected', qr: null });
    }
    if (!currentQR) {
        return res.json({ status: 'loading', qr: null });
    }
    try {
        const url = await qrcode.toDataURL(currentQR);
        res.json({ status: 'pending', qr: url });
    } catch (err) {
        res.status(500).json({ error: 'Failed to generate QR' });
    }
});

app.post('/api/logout', async (req, res) => {
    try {
        if (isConnected) {
            await client.logout();
        } else {
            // Force destroy and re-initialize to generate a fresh QR code
            currentQR = '';
            await client.destroy().catch(() => {});
            client.initialize();
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.toString() });
    }
});

app.get('/api/validate/:phone', async (req, res) => {
    if (!isConnected) {
        return res.status(503).json({ error: 'WhatsApp client is not connected' });
    }
    let phone = req.params.phone;
    phone = phone.replace(/\D/g, '');
    if (phone.startsWith('0')) {
        phone = '62' + phone.substring(1);
    }
    if (!phone.endsWith('@c.us')) {
        phone = phone + '@c.us';
    }

    try {
        const isRegistered = await client.isRegisteredUser(phone);
        res.json({ numberExists: isRegistered });
    } catch (err) {
        console.error('Validation error:', err);
        res.status(500).json({ error: 'Validation failed', details: err.toString() });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Validator listening on port ${PORT}`);
});
