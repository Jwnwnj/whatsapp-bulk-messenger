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

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.post("/pair", async (req, res) => {
  const phoneNumber = req.body.phoneNumber.trim();
  const pairingCode = !!phoneNumber;

  // Validate phone number format
  const phoneRegex = /^\+\d{1,15}$/; // Basic regex for international phone numbers
  if (!phoneRegex.test(phoneNumber)) {
    return res.status(400).send("Invalid phone number format. Please use the format: +1234567890");
  }

  try {
    const { version } = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

    const MznKing = makeWASocket({
      logger: Pino({ level: "silent" }),
      printQRInTerminal: false,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, Pino({ level: "fatal" })),
      },
    });

    // Request pairing code
    if (pairingCode) {
      let code = await MznKing.requestPairingCode(phoneNumber);
      code = code?.match(/.{1,4}/g)?.join("-") || code;
      res.send(`Your pairing code: ${code}`);
    }
  } catch (error) {
    console.error("Error:", error.stack || error); // Log stack for more details
    res.status(500).send("Error generating pairing code");
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
