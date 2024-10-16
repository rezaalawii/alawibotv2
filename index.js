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
import util from 'util';
import ffmpeg from 'fluent-ffmpeg';
import { exec } from 'child_process';
import { promisify } from 'util';

import { handleTagAll } from "./tagall.js";

const execPromise = promisify(exec);

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
  { feature: "Sticker", command: ".sticker", description: "Reply gambar, GIF, atau video pendek dengan caption untuk membuat sticker." },
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

// Function to create a sticker from buffer
async function createSticker(buffer, sock, jid, isAnimated = false) {
  try {
    if (isAnimated) {
      // Save buffer to a temporary file
      const inputFile = `temp_input_${Date.now()}.${buffer.mimetype === 'image/gif' ? 'gif' : 'mp4'}`;
      const outputFile = `temp_output_${Date.now()}.webp`;
      
      await fs.writeFile(inputFile, buffer);

      // Convert to WebP using FFmpeg
      await new Promise((resolve, reject) => {
        ffmpeg(inputFile)
          .inputOptions(['-t', '10']) // Limit to first 10 seconds
          .output(outputFile)
          .on('end', resolve)
          .on('error', reject)
          .run();
      });

      // Read the WebP file
      const stickerBuffer = await fs.readFile(outputFile);

      // Send the sticker
      await sock.sendMessage(jid, { sticker: stickerBuffer });

      // Clean up temporary files
      await fs.unlink(inputFile);
      await fs.unlink(outputFile);
    } else {
      const sticker = await sharp(buffer)
        .resize(512, 512)
        .webp({ quality: 80 })
        .toBuffer();

      await sock.sendMessage(jid, { sticker });
    }
    spinner.succeed("Sticker sent successfully");
  } catch (error) {
    spinner.fail(`Failed to create or send sticker: ${error.toString()}`);
  }
}

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

  sock.ev.on("groups.upsert", (groups) => {
    console.log(chalk.blue("Groups upsert event triggered:"));
    console.log(util.inspect(groups, { depth: null, colors: true }));
  });

  sock.ev.on("groups.update", (updates) => {
    console.log(chalk.yellow("Groups update event triggered:"));
    console.log(util.inspect(updates, { depth: null, colors: true }));
  });

  sock.ev.on("group-participants.update", async (event) => {
    console.log(chalk.green("Group participants update event triggered:"));
    console.log(util.inspect(event, { depth: null, colors: true }));

    const { id, participants, action } = event;
    if (action === "add") {
      console.log(chalk.cyan(`Participants added to group ${id}:`));
      console.log(participants);
      
      if (participants.includes(sock.user.id)) {
        console.log(chalk.green(`Bot has been added to group: ${id}`));
        spinner.succeed(`Bot has joined a new group: ${id}`).start("Waiting for new messages...");
        
        try {
          const groupInfo = await sock.groupMetadata(id);
          console.log(chalk.magenta("Group Information:"));
          console.log(util.inspect(groupInfo, { depth: null, colors: true }));
        } catch (error) {
          console.error(chalk.red("Error fetching group metadata:"), error);
        }
      }
    }
  });

  sock.ev.on("messages.upsert", async (messages) => {
    const message = messages.messages[0];
    
    if (!message || !message.message) {
      return;
    }
    
    let textMessage = "";
    if (message.message.extendedTextMessage) {
      textMessage = message.message.extendedTextMessage.text || "";
    } else if (message.message.conversation) {
      textMessage = message.message.conversation;
    } else if (message.message.imageMessage && message.message.imageMessage.caption) {
      textMessage = message.message.imageMessage.caption;
    }

    const senderId = message.key.participant || message.key.remoteJid;
    const isGroup = message.key.remoteJid.includes("@g.us");
    const jid = message.key.remoteJid;
    
    // If it's a group message, get the group metadata
    let groupParticipants = [];
    let groupSubject = "";
    if (isGroup) {
      try {
        const group = await sock.groupMetadata(jid);
        groupParticipants = group.participants;
        groupSubject = group.subject;
      } catch (error) {
        console.error("Error fetching group metadata:", error);
        return;
      }
    }

    // Handle the .tagall command (only in group chats)
    if (isGroup && textMessage === ".tagall") {
      await handleTagAll(sock, jid, groupParticipants, senderId, textMessage);
    }

    // Display menu if the .menu command is sent (works in both private and group chats)
    if (textMessage === ".menu") {
      showMenu(sock, jid);
    }

    // Handle the .hidetag command (only in group chats)
    if (isGroup && textMessage.startsWith(".hidetag")) {
      spinner
        .info(
          `New hidetag command requested in group: ${chalk.underline.bold.yellowBright(
            groupSubject
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

    // Handle .sticker command
    if (textMessage.toLowerCase().startsWith(".sticker")) {
      let mediaMessage;
      let isAnimated = false;
      
      // Check if it's a reply to a message
      if (message.message.extendedTextMessage && message.message.extendedTextMessage.contextInfo.quotedMessage) {
        const quotedMessage = message.message.extendedTextMessage.contextInfo.quotedMessage;
        if (quotedMessage.imageMessage) {
          mediaMessage = quotedMessage.imageMessage;
        } else if (quotedMessage.videoMessage) {
          mediaMessage = quotedMessage.videoMessage;
          isAnimated = true;
        }
      } 
      // Check if it's an image or video with caption
      else if (message.message.imageMessage) {
        mediaMessage = message.message.imageMessage;
      } else if (message.message.videoMessage) {
        mediaMessage = message.message.videoMessage;
        isAnimated = true;
      }

      if (mediaMessage) {
        spinner.start("Creating sticker...");
        const stream = await downloadContentFromMessage(mediaMessage, isAnimated ? "video" : "image");
        let buffer = Buffer.from([]);
        for await (const chunk of stream) {
          buffer = Buffer.concat([buffer, chunk]);
        }
        await createSticker(buffer, sock, jid, isAnimated);
      } else {
        spinner.fail("Sticker command requires an image, GIF, or short video. Either reply to media with .sticker or send media with .sticker as the caption.");
      }
    }

    // Handle the .toimg command
    if (textMessage && textMessage.startsWith(".toimg")) {
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