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
import ffmpegStatic from 'ffmpeg-static';
ffmpeg.setFfmpegPath(ffmpegStatic);
import { exec } from 'child_process';
import { promisify } from 'util';

import { handleTagAll } from "./feature/tagall.js";
import { handleSteal } from "./feature/steal.js";

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

const showCleanMenu = (sock, jid, userName) => {
  const menuItems = [
    { feature: "Tag All", command: ".tagall", description: "Mention semua anggota di grup." },
    { feature: "Hidetag", command: ".hidetag [pesan] / reply stiker", description: "Tag ghoib." },
    { feature: "Sticker", command: ".sticker", description: "Buat sticker dari gambar/video." },
    { feature: "Sticker to Image", command: ".toimg", description: "Ubah sticker ke gambar." },
    { feature: "Steal Media", command: ".steal", description: "Liat pesan 1x dilihat" },
    { feature: "Menu", command: ".menu", description: "Tampilkan semua menu." },
  ];

  let menuMessage = `Halo, ${userName}!\n\n`;
  menuMessage += "╔════ ALAWI BOT MENU ════╗\n\n";

  menuItems.forEach((item, index) => {
    menuMessage += `◉ ${item.feature}\n`;
    menuMessage += `   Perintah: ${item.command}\n`;
    menuMessage += `   Deskripsi: ${item.description}\n`;
    if (index < menuItems.length - 1) {
      menuMessage += "\n";
    }
  });

  menuMessage += "\n╚════════════════════╝\n\n";
  menuMessage += "Developed by: Reza Alawi\n";
  menuMessage += "Powered by: Alawi Bot\n";

  sock.sendMessage(jid, { text: menuMessage });
};

async function createSticker(buffer, sock, jid, isAnimated = false) {
  try {
    if (isAnimated) {

      const tempPath = './temp';


      if (!fs.existsSync(tempPath)) {
        await fs.mkdir(tempPath);
      }

      const timestamp = Date.now();
      const inputFile = `${tempPath}/input_${timestamp}.${buffer.mimetype === 'image/gif' ? 'gif' : 'mp4'}`;
      const outputFile = `${tempPath}/output_${timestamp}.webp`;


      await fs.writeFile(inputFile, buffer);

      try {

        const probe = await new Promise((resolve, reject) => {
          ffmpeg.ffprobe(inputFile, (err, metadata) => {
            if (err) reject(err);
            else resolve(metadata);
          });
        });

        const { width, height } = probe.streams[0];

        const maxSize = 512;
        const scale = Math.min(maxSize / width, maxSize / height);
        const newWidth = Math.round(width * scale);
        const newHeight = Math.round(height * scale);

        const padX = Math.round((maxSize - newWidth) / 2);
        const padY = Math.round((maxSize - newHeight) / 2);


        await new Promise((resolve, reject) => {
          ffmpeg(inputFile)
            .addOutputOptions([
              `-vf`, `scale=${newWidth}:${newHeight},pad=${maxSize}:${maxSize}:${padX}:${padY}:color=ffffff00,format=yuva420p`,
              `-vcodec`, `libwebp`,
              `-lossless`, `1`,
              `-qscale`, `90`,
              `-preset`, `default`,
              `-loop`, `0`,
              `-an`,
              `-vsync`, `0`,
              `-t`, `10`
            ])
            .toFormat('webp')
            .on('end', resolve)
            .on('error', reject)
            .save(outputFile);
        });


        const stickerBuffer = await fs.readFile(outputFile);


        await sock.sendMessage(jid, { sticker: stickerBuffer });


        await fs.unlink(inputFile).catch(console.error);
        await fs.unlink(outputFile).catch(console.error);

      } catch (ffmpegError) {
        console.error('FFmpeg Error:', ffmpegError);
        spinner.fail(`FFmpeg Error: ${ffmpegError.message}`);


        await fs.unlink(inputFile).catch(console.error);
        await fs.unlink(outputFile).catch(console.error);
        throw ffmpegError;
      }

    } else {
      const image = sharp(buffer);
      const metadata = await image.metadata();

      const maxSize = 512;

      const scale = Math.min(maxSize / metadata.width, maxSize / metadata.height);
      const newWidth = Math.round(metadata.width * scale);
      const newHeight = Math.round(metadata.height * scale);

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

  const groupNames = {};

  sock.ev.on("groups.upsert", async (groups) => {
    for (const group of groups) {
      try {
        const groupMetadata = await sock.groupMetadata(group.id);
        groupNames[group.id] = groupMetadata.subject;
        spinner.succeed(chalk.green(`[BOT JOIN] Bot telah dimasukan ke dalam grup ${chalk.white(groupMetadata.subject)}`)).start("Menunggu perintah...");
      } catch (error) {
        console.error("Error fetching group metadata:", error);
      }
    }
  });
  
  sock.ev.on("groups.update", (updates) => {
    spinner.info(chalk.yellow("[GROUP UPDATE] Terjadi perubahan pada grup:"));
    console.log(util.inspect(updates, { depth: null, colors: true }));
  });
  
  sock.ev.on("group-participants.update", async (event) => {
    const { id, participants, action } = event;
    let groupName = groupNames[id] || 'Unknown Group';
  
    const botNumber = sock.user.id.split(':')[0] + '@s.whatsapp.net';
  
    try {
      // Only try to fetch group metadata if the bot is still in the group
      if (!participants.includes(botNumber) || action !== 'remove') {
        const groupMetadata = await sock.groupMetadata(id);
        groupName = groupMetadata.subject;
        groupNames[id] = groupName;
      }
  
      // Format participantInfo to display WhatsApp number/name
      const participantInfo = participants.map(participant => {
        const number = participant.split('@')[0];
        return `${number}`;
      }).join(', ');
  
      switch (action) {
        case "add":
          if (participants.includes(botNumber)) {
            spinner.succeed(chalk.green(`[BOT JOIN] Bot telah ditambahkan ke grup ${chalk.white(groupName)}`)).start("Menunggu perintah...");
          } else {
            spinner.info(chalk.yellow(`[MEMBER JOIN] ${chalk.white(participantInfo)} telah bergabung ke grup ${chalk.white(groupName)}`)).start("Menunggu perintah...");
          }
          break;
        case "remove":
          if (participants.includes(botNumber)) {
            spinner.succeed(chalk.red(`[BOT DIKICK] Bot telah dikeluarkan dari grup ${chalk.white(groupName)}`)).start("Menunggu perintah...");
            delete groupNames[id];
          } else {
            spinner.info(chalk.yellow(`[MEMBER KELUAR] ${chalk.white(participantInfo)} telah keluar dari grup ${chalk.white(groupName)}`)).start("Menunggu perintah...");
          }
          break;
        case "promote":
          if (participants.includes(botNumber)) {
            spinner.succeed(chalk.green(`[BOT DIPROMOTE] Bot telah dijadikan admin di grup ${chalk.white(groupName)}`)).start("Menunggu perintah...");
          } else {
            spinner.info(chalk.yellow(`[MEMBER DIPROMOTE] ${chalk.white(participantInfo)} telah dijadikan admin di grup ${chalk.white(groupName)}`)).start("Menunggu perintah...");
          }
          break;
        case "demote":
          if (participants.includes(botNumber)) {
            spinner.succeed(chalk.green(`[BOT DIDEMOTE] Bot telah diturunkan dari admin di grup ${chalk.white(groupName)}`)).start("Menunggu perintah...");
          } else {
            spinner.info(chalk.yellow(`[MEMBER DIDEMOTE] ${chalk.white(participantInfo)} telah diturunkan dari admin di grup ${chalk.white(groupName)}`)).start("Menunggu perintah...");
          }
          break;
      }
    } catch (error) {
      // If there's an error fetching group metadata, it might be because the bot was kicked
      if (error.data === 403 && participants.includes(botNumber) && action === 'remove') {
        spinner.succeed(chalk.red(`[BOT DIKICK] Bot telah dikeluarkan dari grup ${chalk.white(groupName)}`)).start("Menunggu perintah...");
        delete groupNames[id];
      } else {
        console.error("Error handling group participant update:", error);
        spinner.fail(`Terjadi error saat menangani perubahan peserta grup: ${error.message}`).start("Menunggu perintah...");
      }
    }
  });

  // Add this event listener to handle when the bot is removed from a group
  sock.ev.on("groups.update", async (updates) => {
    for (const update of updates) {
      if (update.announce === true) {
        const groupName = groupNames[update.id] || 'Unknown Group';
        spinner.succeed(chalk.red(`[BOT DIKICK] Bot telah dikeluarkan dari grup ${chalk.white(groupName)}`)).start("Menunggu perintah...");
        delete groupNames[update.id];
      }
    }
  });
  
  const logCommand = (textMessage, senderName, senderNumber, groupName) => {
    spinner.info(chalk.cyan(`[COMMAND] ${chalk.white(textMessage)} dari ${chalk.white(senderName)} (${chalk.white(senderNumber)}) di grup ${chalk.white(groupName)}`)).start("Menunggu perintah...");
  };

  sock.ev.on("messages.upsert", async (messages) => {
    const message = messages.messages[0];
  
    if (!message || !message.message) {
      return;
    }
  
    const senderId = message.key.participant || message.key.remoteJid;
    const senderNumber = senderId.split('@')[0];
    const senderName = message.pushName || senderNumber;
    
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
  
    const isGroup = message.key.remoteJid.includes("@g.us");
    const jid = message.key.remoteJid;
  
    if (!isGroup) {
      // Log the command for private chats
      if (textMessage.startsWith('.')) {
        spinner.info(chalk.cyan(`[COMMAND] ${chalk.white(textMessage)} dari ${chalk.white(senderName)} (${chalk.white(senderNumber)})`)).start("Menunggu perintah...");
      }
    }
    
    let groupParticipants = [];
    let groupSubject = "";
    if (isGroup) {
      try {
        const group = await sock.groupMetadata(jid);
        groupParticipants = group.participants;
        groupSubject = group.subject;
  
        // Log all commands
        if (textMessage.startsWith('.')) {
          logCommand(textMessage, senderName, senderNumber, groupSubject);
        }
      } catch (error) {
        console.error("Error fetching group metadata:", error);
        return;
      }
    }


    if (isGroup && textMessage === ".hidetag" && message.message?.extendedTextMessage?.contextInfo?.quotedMessage?.stickerMessage) {
      spinner
        .info(
          `New sticker hidetag command requested in group: ${chalk.underline.bold.yellowBright(
            groupSubject
          )} (${groupParticipants.length
          } participants)\nSticker Hidetag\n\n`
        )
        .start();
    
      const stickerMessage = message.message.extendedTextMessage.contextInfo.quotedMessage.stickerMessage;
    
      try {
        // Ambil konten sticker sebagai buffer
        const stream = await downloadContentFromMessage(stickerMessage, "sticker");
        let buffer = Buffer.from([]);
        for await (const chunk of stream) {
          buffer = Buffer.concat([buffer, chunk]);
        }
    
        // Kirim sticker dengan hidetag
        await sock.sendMessage(jid, {
          sticker: buffer,
          mentions: groupParticipants.map((item) => item.id),
        });
    
        spinner.succeed("Sticker Hidetag sent successfully.");
      } catch (error) {
        spinner.fail(`Failed to send sticker using hidetag. Error: ${error.toString()}`);
      }
    
      return;
    }
    
    if (isGroup && textMessage.startsWith(".hidetag")) {
      spinner
        .info(
          `New hidetag command requested in group: ${chalk.underline.bold.yellowBright(
            groupSubject
          )} (${groupParticipants.length
          } participants)\nMessage: ${textMessage}\n\n`
        )
        .start();

      const messageBody = textMessage.slice(9).trim() || "";

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


    if (isGroup && textMessage === ".tagall") {
      await handleTagAll(sock, jid, groupParticipants, senderId, textMessage);
    }

    if (textMessage === ".menu") {
      const userName = message.pushName || "Pengguna"; 
      showCleanMenu(sock, jid, userName);
    }

    if (textMessage.toLowerCase() === ".steal") {
      await handleSteal(sock, jid, message, groupSubject); 
    }


    if (textMessage.toLowerCase().startsWith(".sticker")) {
      let mediaMessage;
      let isAnimated = false;
    
      if (message.message.extendedTextMessage?.contextInfo?.quotedMessage) {
        const quotedMessage = message.message.extendedTextMessage.contextInfo.quotedMessage;
        if (quotedMessage.imageMessage) {
          mediaMessage = quotedMessage.imageMessage;
        } else if (quotedMessage.videoMessage) {
          mediaMessage = quotedMessage.videoMessage;
          isAnimated = true;
        }
      }
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
          await createSticker(buffer, sock, jid, isAnimated, true);
        } catch (error) {
          spinner.fail(`Error creating sticker: ${error.message}`);
          // Send error notification to the chat
          await sock.sendMessage(jid, {
            text: "Maaf, terjadi kesalahan saat membuat sticker. Pastikan media yang Anda kirim adalah gambar, GIF, atau video pendek yang valid.",
          });
        }
      } else {
        spinner.fail("Sticker command requires an image, GIF, or short video.");
        // Send error notification to the chat
        await sock.sendMessage(jid, {
          text: "Perintah sticker memerlukan gambar, GIF, atau video pendek. Silakan kirim media dengan caption .sticker atau reply media dengan pesan .sticker",
        });
      }
    }
    
    if (textMessage && textMessage.startsWith(".toimg")) {
      const quotedMessage = message.message?.extendedTextMessage?.contextInfo
        ?.quotedMessage?.stickerMessage;
    
      if (quotedMessage) {
        try {
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
        } catch (error) {
          spinner.fail(`Error converting sticker to image: ${error.message}`);
          await sock.sendMessage(jid, {
            text: "Maaf, terjadi kesalahan saat mengkonversi sticker ke gambar. Pastikan Anda me-reply sebuah sticker.",
          });
        }
      } else {
        spinner.fail("To convert sticker to image, quote a sticker");
        await sock.sendMessage(jid, {
          text: "Untuk mengkonversi sticker ke gambar, silakan reply sticker dengan pesan .toimg",
        });
      }
    }
    
      });
    };
    
    showBanner();
    whatsapp();