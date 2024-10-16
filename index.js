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

const menuItems = [
  { feature: "Tag All", command: ".tagall", description: "Mention semua anggota di grup." },
  { feature: "Hidetag", command: ".hidetag [pesan] atau reply sticker dengan .hidetag", description: "Tag tidak terlihat." },
  { feature: "Sticker", command: ".sticker", description: "Reply gambar, GIF, atau video pendek dengan caption untuk membuat sticker." },
  { feature: "Sticker to Image", command: ".toimg", description: "Mengubah sticker ke gambar." },
  { feature: "Menu", command: ".menu", description: "Menampilkan semua menu." },
];

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

async function createSticker(buffer, sock, jid, isAnimated = false) {
  try {
    if (isAnimated) {
      const inputFile = `temp_input_${Date.now()}.${buffer.mimetype === 'image/gif' ? 'gif' : 'mp4'}`;
      const outputFile = `temp_output_${Date.now()}.webp`;

      await fs.writeFile(inputFile, buffer);

      const probe = await new Promise((resolve, reject) => {
        ffmpeg.ffprobe(inputFile, (err, metadata) => {
          if (err) reject(err);
          else resolve(metadata);
        });
      });

      const { width, height } = probe.streams[0];
      
      // Calculate dimensions to fit within a square while maintaining aspect ratio
      const maxSize = 512;
      const scale = Math.min(maxSize / width, maxSize / height);
      const newWidth = Math.round(width * scale);
      const newHeight = Math.round(height * scale);
      
      // Calculate padding to center the image
      const padX = Math.round((maxSize - newWidth) / 2);
      const padY = Math.round((maxSize - newHeight) / 2);

      await new Promise((resolve, reject) => {
        ffmpeg(inputFile)
          .inputOptions(['-t', '10']) // Limit to first 10 seconds
          .complexFilter([
            // Scale while maintaining aspect ratio
            `scale=${newWidth}:${newHeight}:force_original_aspect_ratio=decrease`,
            // Pad to square with transparency
            `pad=${maxSize}:${maxSize}:${padX}:${padY}:color=ffffff00`
          ])
          .outputOptions([
            '-vcodec', 'libwebp',
            '-vf', 'format=yuva420p',
            '-lossless', '1',
            '-compression_level', '6',
            '-qscale', '20',
            '-preset', 'default',
            '-loop', '0'
          ])
          .toFormat('webp')
          .output(outputFile)
          .on('end', resolve)
          .on('error', reject)
          .run();
      });

      const stickerBuffer = await fs.readFile(outputFile);
      await sock.sendMessage(jid, { sticker: stickerBuffer });

      // Cleanup temporary files
      await fs.unlink(inputFile);
      await fs.unlink(outputFile);
    } else {
      const image = sharp(buffer);
      const metadata = await image.metadata();
      
      // Target dimensions
      const maxSize = 512;
      
      // Calculate dimensions to fit within a square while maintaining aspect ratio
      const scale = Math.min(maxSize / metadata.width, maxSize / metadata.height);
      const newWidth = Math.round(metadata.width * scale);
      const newHeight = Math.round(metadata.height * scale);
      
      // Create a square canvas with transparency
      const sticker = await image
        .resize(newWidth, newHeight, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        })
        .extend({
          top: Math.round((maxSize - newHeight) / 2),
          bottom: Math.round((maxSize - newHeight) / 2),
          left: Math.round((maxSize - newWidth) / 2),
          right: Math.round((maxSize - newWidth) / 2),
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        })
        .webp({
          quality: 100,
          lossless: true,
          force: true
        })
        .toBuffer();

      await sock.sendMessage(jid, { sticker });
    }
    spinner.succeed("Sticker sent successfully");
  } catch (error) {
    spinner.fail(`Failed to create or send sticker: ${error.toString()}`);
    console.error('Detailed error:', error);
  }
}


const whatsapp = async () => {
  const { state, saveCreds } = await useMultiFileAuthState(".auth_sessions");

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    logger,
    browser: ["Alawi Bot", "Chrome", "20.0.04"],
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
        spinner.start("Menghubungkan...");
        whatsapp();
      }
    } else if (connection === "open") {
      spinner.succeed("Opened connection").start("Menunggu perintah...");
    }
  });

  sock.ev.on("creds.update", saveCreds);

  // Object untuk menyimpan nama grup berdasarkan ID grup
const groupNames = {};

sock.ev.on("groups.upsert", async (groups) => {
  for (const group of groups) {
    try {
      const groupMetadata = await sock.groupMetadata(group.id);
      groupNames[group.id] = groupMetadata.subject; // Simpan nama grup berdasarkan ID
      console.log(chalk.green(`Ditambahkan ke grup ${groupMetadata.subject}`));
      spinner.succeed(`Bot telah dimasukan ke dalam grup ${groupMetadata.subject}`).start("Menunggu perintah...");
    } catch (error) {
      console.error("Error fetching group metadata:", error);
    }
  }
});

sock.ev.on("groups.update", (updates) => {
  console.log(chalk.yellow("Groups update event triggered:"));
  console.log(util.inspect(updates, { depth: null, colors: true }));
});

sock.ev.on("group-participants.update", async (event) => {
  const { id, participants, action } = event;
  let groupName = groupNames[id] || id; // Ambil nama grup yang disimpan, atau gunakan ID sebagai default

  try {
    // Ambil metadata grup kecuali untuk aksi 'remove'
    if (action !== 'remove') {
      const groupMetadata = await sock.groupMetadata(id);
      groupName = groupMetadata.subject; // Jika metadata berhasil, gunakan nama grup
      groupNames[id] = groupName; // Update nama grup di cache
    }

    if (action === "promote") {
      console.log(chalk.green(`Bot telah menjadi admin di grup ${groupName}`));
      spinner.succeed(`Bot telah menjadi admin di grup ${groupName}`).start("Menunggu perintah...");
    } else if (action === "demote") {
      console.log(chalk.green(`Bot telah dihapus dari admin di grup ${groupName}`));
      spinner.succeed(`Bot telah dihapus dari admin di grup ${groupName}`).start("Menunggu perintah...");
    } else if (action === "remove") {
      // Cek apakah grup sudah ada dalam cache, jika tidak gunakan ID
      if (groupNames[id]) {
        console.log(chalk.red(`Bot telah dikeluarkan dari grup ${groupNames[id]}`)); // Nama grup dari cache
        spinner.succeed(`Bot telah dikeluarkan dari grup ${groupNames[id]}`).start("Menunggu perintah...");
      } else {
        console.log(chalk.red(`Bot telah dikeluarkan dari grup ${groupName}`)); // ID grup jika tidak ada dalam cache
        spinner.succeed(`Bot telah dikeluarkan dari grup ${groupName}`).start("Menunggu perintah...");
      }
    }
  } catch (error) {
    console.error("Error fetching group metadata:", error);
    
    // Jika ada error, tetap berikan log dengan warna merah saat aksi remove
    if (action === "remove") {
      console.log(chalk.red(`Bot telah dikeluarkan dari grup ${groupName}`)); // Nama grup diambil dari cache
      spinner.succeed(`Bot telah dikeluarkan dari grup ${groupName}`).start("Menunggu perintah...");
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
  } else if (message.message.videoMessage && message.message.videoMessage.caption) {
    textMessage = message.message.videoMessage.caption;
  }

  const senderId = message.key.participant || message.key.remoteJid;
  const isGroup = message.key.remoteJid.includes("@g.us");
  const jid = message.key.remoteJid;
  
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

  // Fitur baru: Reply ke sticker dengan .hidetag
  if (isGroup && textMessage === ".hidetag" && message.message?.extendedTextMessage?.contextInfo?.quotedMessage?.stickerMessage) {
    spinner
      .info(
        `New sticker hidetag command requested in group: ${chalk.underline.bold.yellowBright(
          groupSubject
        )} (${
          groupParticipants.length
        } participants)\nSticker Hidetag\n\n`
      )
      .start();

    const stickerMessage = message.message.extendedTextMessage.contextInfo.quotedMessage.stickerMessage;

    try {
      await sock.sendMessage(jid, {
        sticker: stickerMessage,
        mentions: groupParticipants.map((item) => item.id),
      });
    } catch (error) {
      spinner.fail(
        `Failed to send sticker using hidetag. Error: ${error.toString()}`
      );
    }
    // Kembali untuk menghindari pemrosesan lebih lanjut
    return;
  }

  // Fitur Hidetag yang sudah ada
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

  // Fitur lain seperti .menu dan .tagall tetap sama
  if (isGroup && textMessage === ".tagall") {
    await handleTagAll(sock, jid, groupParticipants, senderId, textMessage);
  }

  if (textMessage === ".menu") {
    showMenu(sock, jid);
  }

    // Updated sticker handling for both reply and direct media + caption
    if (textMessage.toLowerCase().startsWith(".sticker")) {
      let mediaMessage;
      let isAnimated = false;
      
      // Check if it's a reply to a message
      if (message.message.extendedTextMessage?.contextInfo?.quotedMessage) {
        const quotedMessage = message.message.extendedTextMessage.contextInfo.quotedMessage;
        if (quotedMessage.imageMessage) {
          mediaMessage = quotedMessage.imageMessage;
        } else if (quotedMessage.videoMessage) {
          mediaMessage = quotedMessage.videoMessage;
          isAnimated = true;
        }
      } 
      // Check if it's a direct media message with caption
      else if (message.message.imageMessage) {
        mediaMessage = message.message.imageMessage;
      } else if (message.message.videoMessage) {
        mediaMessage = message.message.videoMessage;
        isAnimated = true;
      }

      if (mediaMessage) {
        spinner.start("Creating sticker...");
        try {
          const stream = await downloadContentFromMessage(mediaMessage, isAnimated ? "video" : "image");
          let buffer = Buffer.from([]);
          for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk]);
          }
          await createSticker(buffer, sock, jid, isAnimated, true); // true for maintainRatio
        } catch (error) {
          spinner.fail(`Error creating sticker: ${error.message}`);
        }
      } else {
        spinner.fail("Sticker command requires an image, GIF, or short video. Either reply to media with .sticker or send media with .sticker as the caption.");
      }
    }

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

showBanner();
whatsapp();