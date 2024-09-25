const express = require('express');
const multer = require('multer');
const fs = require('fs');
const { makeWASocket } = require('@whiskeysockets/baileys');
const pino = require('pino');
const { useMultiFileAuthState, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const NodeCache = require('node-cache');
const session = require('express-session');

const upload = multer({ dest: 'uploads/' });
const app = express();
const port = 3000;

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(session({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: true,
}));

// Dummy user data for authentication
const users = {
    user1: 'password1',
    user2: 'password2',
};

// Serve the HTML form
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html'); // Ensure this is your correct path
});

// Handle login
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (users[username] && users[username] === password) {
        req.session.user = username; // Store user in session
        res.sendStatus(200); // Send success status
    } else {
        res.sendStatus(401); // Send unauthorized status
    }
});

// Handle form submission
app.post('/start', upload.single('messagesFile'), async (req, res) => {
    if (!req.session.user) {
        return res.status(403).send('You need to log in first.');
    }
    
    try {
        const targetNumber = req.body.targetNumber;
        const intervalTime = parseInt(req.body.intervalTime, 10);
        const messagesFilePath = req.file.path;
        const messages = fs.readFileSync(messagesFilePath, 'utf-8').split('\n').filter(Boolean);

        await startSocket(targetNumber, messages, intervalTime);

        res.send('Messages are being sent, check the console for details.');
    } catch (error) {
        console.error('Error:', error);
        res.status(500).send('An error occurred.');
    }
});

// Function to send messages
async function sendMessages(socket, targetNumber, messages, intervalTime) {
    for (const message of messages) {
        await socket.sendMessage(targetNumber + '@c.us', { text: message });
        console.log(`Message sent: ${message}`);
        await new Promise((resolve) => setTimeout(resolve, intervalTime * 1000));
    }

    // Cleanup
    setTimeout(() => {
        fs.rmSync('./session', { recursive: true, force: true });
        console.log('Session folder removed!');
    }, 30000);
}

// WhatsApp connection setup
async function startSocket(targetNumber, messages, intervalTime) {
    const { version } = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useMultiFileAuthState(`./session`);
    const msgRetryCounterCache = new NodeCache();

    const socket = makeWASocket({
        logger: pino({ level: 'silent' }),
        version,
        printQRInTerminal: false,
        auth: state,
    });

    socket.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'open') {
            console.log("Successfully paired!");
            // Start sending messages
            await sendMessages(socket, targetNumber, messages, intervalTime);
        }

        // Retry on disconnect
        if (connection === 'close' && lastDisconnect?.error) {
            console.log('Connection closed, retrying...');
            setTimeout(() => startSocket(targetNumber, messages, intervalTime), 5000);
        }
    });

    socket.ev.on('creds.update', saveCreds);
}

// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
