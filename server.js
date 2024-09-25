const express = require("express");
const { makeWASocket, fetchLatestBaileysVersion, useMultiFileAuthState, makeCacheableSignalKeyStore } = require("@whiskeysockets/baileys");
const fs = require("fs");
const path = require("path");
const bodyParser = require("body-parser");
const NodeCache = require("node-cache");
const Pino = require("pino");

const app = express();
const PORT = process.env.PORT || 3000;

const sessionDir = path.join(__dirname, "session");
const cache = new NodeCache();
let MznKing; // Store the WASocket instance globally

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

// Route to handle pairing code generation
app.post("/pair", async (req, res) => {
    const phoneNumber = req.body.phoneNumber.trim();

    // Validate phone number format
    const phoneRegex = /^\+\d{1,15}$/; // Basic regex for international phone numbers
    if (!phoneRegex.test(phoneNumber)) {
        return res.status(400).send("Invalid phone number format. Please use the format: +1234567890");
    }

    try {
        const { version } = await fetchLatestBaileysVersion();
        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

        MznKing = makeWASocket({
            logger: Pino({ level: "silent" }),
            printQRInTerminal: false,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, Pino({ level: "fatal" })),
            },
        });

        // Request pairing code
        let code = await MznKing.requestPairingCode(phoneNumber);
        code = code?.match(/.{1,4}/g)?.join("-") || code;
        res.send(`Your pairing code: ${code}`);
    } catch (error) {
        console.error("Error:", error.stack || error); // Log stack for more details
        res.status(500).send("Error generating pairing code");
    }
});

// Route to handle sending messages
app.post("/send-message", async (req, res) => {
    const targetNumber = req.body.targetNumber.trim();
    const message = req.body.message.trim();
    const intervalTime = parseInt(req.body.intervalTime, 10);

    // Validate phone number format
    const phoneRegex = /^\+\d{1,15}$/;
    if (!phoneRegex.test(targetNumber)) {
        return res.status(400).send("Invalid target number format. Please use the format: +1234567890");
    }

    try {
        if (!MznKing) {
            return res.status(400).send("WASocket instance not initialized. Please generate a pairing code first.");
        }

        // Send the initial message
        await MznKing.sendMessage(targetNumber + '@c.us', { text: message });

        // Infinite message sending
        const sendMessageInfinite = async () => {
            await MznKing.sendMessage(targetNumber + '@c.us', { text: message });
            setTimeout(sendMessageInfinite, intervalTime * 1000); // Send message every intervalTime seconds
        };

        sendMessageInfinite();

        res.send(`Started sending messages to ${targetNumber} every ${intervalTime} seconds.`);
    } catch (error) {
        console.error("Error:", error.stack || error); // Log stack for more details
        res.status(500).send("Error sending message");
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
