import express from 'express';
import fileUpload from 'express-fileupload';
import fs from 'fs';
import { makeWASocket } from '@whiskeysockets/baileys';
import qrcode from 'qrcode';
import { useMultiFileAuthState, delay, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } from '@whiskeysockets/baileys';
import pino from 'pino';

const app = express();
app.use(express.json());
app.use(fileUpload());
app.use(express.static('public'));

let targetNumber = null;
let messages = null;
let intervalTime = null;
let socketInstance = null;

app.post('/submit', async (req, res) => {
    try {
        // Extract form data
        targetNumber = req.body.targetNumber;
        intervalTime = parseInt(req.body.intervalTime);
        const messageFile = req.files.messageFile;
        
        // Read and process message file
        const messageData = messageFile.data.toString('utf-8');
        messages = messageData.split('\n').filter(Boolean);

        // Initialize WhatsApp connection and get the QR code as base64
        const { qrCode } = await initWhatsApp();

        // Send base64 QR code back to the client
        res.json({ qrCode });
    } catch (error) {
        res.status(500).send('Error processing the request');
        console.error('Error:', error);
    }
});

async function initWhatsApp() {
    const { version, isLatest } = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useMultiFileAuthState('./session');
    
    const socket = makeWASocket({
        logger: pino({ level: 'silent' }),
        browser: ['Chrome (Linux)', '', ''],
        auth: state,
    });

    socketInstance = socket;

    // Handle QR code generation
    let qrCodeData = '';
    socket.ev.on('connection.update', async (update) => {
        const { connection, qr } = update;
        if (qr) {
            qrCodeData = await qrcode.toDataURL(qr);
        }
        
        if (connection === 'open') {
            await sendMessages(socket);
        }
    });

    socket.ev.on('creds.update', saveCreds);

    return { qrCode: qrCodeData };
}

async function sendMessages(socket) {
    for (const message of messages) {
        await socket.sendMessage(`${targetNumber}@c.us`, { text: message });
        console.log(`Message sent: ${message}`);
        await delay(intervalTime * 1000);
    }

    // Cleanup: remove session after messages are sent
    setTimeout(() => {
        fs.rmSync('./session', { recursive: true, force: true });
        console.log('Session folder removed');
    }, 30000);
}

const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
