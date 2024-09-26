import express from 'express';
import bodyParser from 'body-parser';
import { makeWASocket } from '@whiskeysockets/baileys';
import fs from 'fs';
import pino from 'pino';
import { delay, useMultiFileAuthState, fetchLatestBaileysVersion, jidNormalizedUser, makeCacheableSignalKeyStore } from '@whiskeysockets/baileys';

const app = express();
const PORT = 3000;

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static('public')); // Serve static files (HTML, CSS)

// Global Variables
let MznKing; // WhatsApp socket instance
let phoneNumber;

// Serve the HTML form for input
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html'); // Create an index.html file for input
});

// Endpoint to handle WhatsApp number submission
app.post('/submit-phone', async (req, res) => {
  phoneNumber = req.body.phoneNumber; // Get the phone number from the form
  try {
    const { version, isLatest } = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useMultiFileAuthState(`./session`);
    
    MznKing = makeWASocket({
      logger: pino({ level: 'silent' }),
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })),
      },
      markOnlineOnConnect: true,
    });

    // Request pairing code
    let code = await MznKing.requestPairingCode(phoneNumber);
    code = code?.match(/.{1,4}/g)?.join("-") || code;

    // Emit the pairing code back to the client
    res.json({ status: 'success', code });
  } catch (error) {
    console.error("Error in phone submission:", error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// Endpoint to handle message sending
app.post('/send-message', async (req, res) => {
  const { targetNumber, messageFile, intervalTime } = req.body;

  try {
    const message = fs.readFileSync(messageFile, 'utf-8'); // Read message from file
    await MznKing.sendMessage(targetNumber + '@c.us', { text: message });

    const sendMessageInfinite = async () => {
      await MznKing.sendMessage(targetNumber + '@c.us', { text: message });
      setTimeout(sendMessageInfinite, intervalTime * 1000); // Send message every intervalTime seconds
    };
    
    sendMessageInfinite();
    res.json({ status: 'success', message: 'Messages are being sent!' });
  } catch (error) {
    console.error("Error in sending message:", error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
