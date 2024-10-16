import ora from "ora";
import chalk from "chalk";
import clear from "console-clear";
import figlet from "figlet";
import qrcode from "qrcode-terminal";
import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  downloadContentFromMessage,
} from "@whiskeysockets/baileys";
import pino from "pino";
import fs from "fs-extra";
import sharp from "sharp";

import { handleTagAll } from "./tagall.js";

const logger = pino({
  level: "silent",
});

const spinner = ora("Starting...").start();

const showBanner = () => {
  clear();

  const program_name = "Alawi Bot";

  const banner = chalk.magentaBright(figlet.textSync(program_name, { horizontalLayout: 'full' }));

  const author =
    chalk.white.bold("\nDeveloped by: ") +
    chalk.cyanBright("Reza Alawi\n");

  const socialMedia = chalk.white.bold("Connect with us:\n") +
    chalk.yellow("GitHub: ") +
    chalk.underline.greenBright("github.com/rezaalawii\n") +
    chalk.magenta("Instagram: ") +
    chalk.blueBright("@rezalawiii\n") +
    chalk.red("TikTok: ") +
    chalk.greenBright("@reza_alawi\n");

  console.log(banner);
  console.log(chalk.bgBlackBright(chalk.white.bold("    Welcome to Alawi Bot!    ")));
  console.log(author);
  console.log(socialMedia);
  console.log(chalk.gray("\n------------------------------\n"));
};

// Daftar fitur dan contoh commandnya
const menuItems = [
  { feature: "Tag All", command: ".tagall", description: "Mention semua anggota di grup." },
  { feature: "Hidetag", command: ".hidetag [pesan]", description: "Tag tidak terlihat." },
  { feature: "Sticker", command: ".sticker", description: "Reply gambar,GIF dan MP4 untuk membuat sticker." },
  { feature: "Sticker to Image", command: ".toimg", description: "Mengubah sticker ke gambar." },
  { feature: "Menu", command: ".menu", description: "Menampilkan semua menu." },
];

// Fungsi untuk menampilkan menu
const showMenu = (sock, jid) => {
  let menuMessage = "=====================\n";
  menuMessage += "        Bot Menu\n";
  menuMessage += "=====================\n\n";
  
  menuItems.forEach(item => {
    menuMessage += `* ${item.feature}\n`;
    menuMessage += `  Command: ${item.command}\n`;
    menuMessage += `  Description: ${item.description}\n\n`;
  });

  menuMessage += "=====================\n";
  menuMessage += "Developed by: Reza Alawi\n";
  menuMessage += "Powered by: Alawi Bot\n";
  menuMessage += "=====================";

  sock.sendMessage(jid, { text: menuMessage });
};

const whatsapp = async () => {
  const { state, saveCreds } = await useMultiFileAuthState(".auth_sessions");

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    logger,
    browser: ["Hidetag Bot", "Chrome", "20.0.04"],
    syncFullHistory: false,
    generateHighQualityLinkPreview: false,
  });

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      showBanner();
      spinner.stop();
      qrcode.generate(qr, { small: true });
      spinner.start("Please scan the QR Code...");
    }

    if (connection === "close") {
      const shouldReconnect =
        lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;

      const loggedOut =
        lastDisconnect.error?.output?.statusCode === DisconnectReason.loggedOut;

      const requiredRestart =
        lastDisconnect.error?.output?.statusCode ===
        DisconnectReason.restartRequired;

      spinner
        .warn(
          "Connection closed due to ",
          lastDisconnect.error,
          ", reconnecting ",
          shouldReconnect
        )
        .start();

      if (loggedOut) {
        fs.emptyDirSync(".auth_sessions");
        showBanner();
        whatsapp();
        return;
      }

      if (shouldReconnect || requiredRestart) {
        showBanner();
        spinner.start("Reconnecting...");
        whatsapp();
      }
    } else if (connection === "open") {
      spinner.succeed("Opened connection").start("Waiting for new messages...");
    }
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("messages.upsert", async (messages) => {
    const message = messages.messages[0];
    
    // Check if it's a text message
    let textMessage = message.message.extendedTextMessage?.text || message.message.conversation;
    
    const senderId = message.key.participant || message.key.remoteJid;
    const isGroup = message.key.remoteJid.includes("@g.us");
    const jid = message.key.remoteJid;
    
    // If it's a group message, get the group metadata
    let groupParticipants = [];
    if (isGroup) {
      const group = await sock.groupMetadata(jid);
      groupParticipants = group.participants;
    }

    // Handle the .tagall command (only in group chats)
    if (isGroup && textMessage && textMessage === ".tagall") {
      await handleTagAll(sock, jid, groupParticipants, senderId, textMessage);
    }

    // Display menu if the .menu command is sent (works in both private and group chats)
    if (textMessage && textMessage === ".menu") {
      showMenu(sock, jid);
    }

    // Handle the .hidetag command (only in group chats)
    if (isGroup && textMessage && textMessage.startsWith(".hidetag")) {
      spinner
        .info(
          `New hidetag command requested in group: ${chalk.underline.bold.yellowBright(
            group.subject
          )} (${
            groupParticipants.length
          } participants)\nMessage: ${textMessage}\n\n`
        )
        .start();

      const messageBody = textMessage.slice(9).trim() || "Hidetag message";

      try {
        // Send the message without showing @mentions
        await sock.sendMessage(jid, {
          text: messageBody,
          mentions: groupParticipants.map((item) => item.id),
        });
      } catch (error) {
        spinner.fail(
          `Failed to send message using hidetag. Error: ${error.toString()}`
        );
      }
    }

    // Handle the .sticker and .toimg commands for both private and group chats
    if (textMessage && textMessage.startsWith(".sticker")) {
      const quotedMessage = message.message?.extendedTextMessage?.contextInfo
        ?.quotedMessage;

      if (
        quotedMessage?.imageMessage ||
        quotedMessage?.videoMessage?.gifPlayback ||
        quotedMessage?.videoMessage
      ) {
        const mediaType = quotedMessage.imageMessage
          ? "imageMessage"
          : "videoMessage";
        const stream = await downloadContentFromMessage(
          quotedMessage[mediaType],
          mediaType === "imageMessage" ? "image" : "video"
        );

        let buffer = Buffer.from([]);
        for await (const chunk of stream) {
          buffer = Buffer.concat([buffer, chunk]);
        }

        if (mediaType === "imageMessage" || mediaType === "videoMessage") {
          const sticker = await sharp(buffer)
            .resize(512, 512)
            .webp({ quality: 80 })
            .toBuffer();

          await sock.sendMessage(jid, {
            sticker,
          });

          spinner.succeed("Sticker sent successfully");
        }
      } else {
        spinner.fail(
          "Sticker command requires an image, GIF, or MP4 to be quoted"
        );
      }
    } else if (textMessage && textMessage.startsWith(".toimg")) {
      const quotedMessage = message.message?.extendedTextMessage?.contextInfo
        ?.quotedMessage?.stickerMessage;

      if (quotedMessage) {
        const stream = await downloadContentFromMessage(
          quotedMessage,
          "sticker"
        );

        let buffer = Buffer.from([]);
        for await (const chunk of stream) {
          buffer = Buffer.concat([buffer, chunk]);
        }

        const image = await sharp(buffer).png().toBuffer();

        await sock.sendMessage(jid, {
          image,
        });

        spinner.succeed("Sticker converted to image successfully");
      } else {
        spinner.fail("To convert sticker to image, quote a sticker");
      }
    }
  });
};

// Run the banner first, then start WhatsApp bot
showBanner();
whatsapp();
