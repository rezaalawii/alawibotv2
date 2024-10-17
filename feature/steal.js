import fs from "fs-extra";
import { downloadContentFromMessage } from "@whiskeysockets/baileys";
import path from "path";
import ora from "ora";
import chalk from "chalk";

const spinner = ora();

export async function handleSteal(sock, jid, message, groupSubject = "Private Chat") {
  try {
    const senderName = message.pushName || "User";
    const isGroup = groupSubject !== "Private Chat";
    const contextInfo = message.message?.extendedTextMessage?.contextInfo;
    const quotedMessage = contextInfo?.quotedMessage;
    const quotedSender = contextInfo?.participant || "Unknown";
    
    spinner.start(`Steal request from ${chalk.yellow(senderName)} in ${chalk.green(groupSubject)}`);

    // Check for quoted viewOnce message
    const isViewOnce = quotedMessage?.viewOnceMessage || quotedMessage?.viewOnceMessageV2;
    
    if (!quotedMessage) {
      spinner.warn("No quoted message found");
      await sock.sendMessage(jid, {
        text: "Reply pesan yang ingin di-steal (viewOnce/status)"
      });
      return;
    }

    let mediaMessage;
    let messageType;
    let caption;

    // Handle viewOnce message
    if (isViewOnce) {
      spinner.text = `Processing viewOnce from ${chalk.blue(quotedSender.split('@')[0])}`;
      const viewOnceContent = quotedMessage.viewOnceMessage?.message || quotedMessage.viewOnceMessageV2?.message;
      
      if (viewOnceContent.imageMessage) {
        mediaMessage = viewOnceContent.imageMessage;
        messageType = "image";
        caption = mediaMessage.caption || "";
        spinner.text = `ViewOnce image from ${chalk.blue(quotedSender.split('@')[0])}`;
      } else if (viewOnceContent.videoMessage) {
        mediaMessage = viewOnceContent.videoMessage;
        messageType = "video";
        caption = mediaMessage.caption || "";
        spinner.text = `ViewOnce video from ${chalk.blue(quotedSender.split('@')[0])}`;
      }
    } 
    // Handle normal media message (for status)
    else if (quotedMessage.imageMessage) {
      mediaMessage = quotedMessage.imageMessage;
      messageType = "image";
      caption = mediaMessage.caption || "";
      spinner.text = `Status image from ${chalk.blue(quotedSender.split('@')[0])}`;
    } else if (quotedMessage.videoMessage) {
      mediaMessage = quotedMessage.videoMessage;
      messageType = "video";
      caption = mediaMessage.caption || "";
      spinner.text = `Status video from ${chalk.blue(quotedSender.split('@')[0])}`;
    }

    if (!mediaMessage) {
      spinner.fail("No supported media found in message");
      await sock.sendMessage(jid, {
        text: "Media tidak ditemukan atau tidak didukung"
      });
      return;
    }

    // Download media
    spinner.text = `Downloading ${messageType}`;
    const stream = await downloadContentFromMessage(mediaMessage, messageType);
    let buffer = Buffer.from([]);
    for await (const chunk of stream) {
      buffer = Buffer.concat([buffer, chunk]);
    }

    // Create directory if it doesn't exist
    const mediaDir = "./stolen_media";
    if (!fs.existsSync(mediaDir)) {
      spinner.text = "Creating stolen_media directory";
      await fs.mkdir(mediaDir);
    }

    // Save media
    const fileName = `stolen_${Date.now()}.${messageType === "image" ? "jpg" : "mp4"}`;
    const filePath = path.join(mediaDir, fileName);
    await fs.writeFile(filePath, buffer);
    spinner.text = `Saving media as ${fileName}`;

    // Send media back
    spinner.text = "Sending media back to chat";
    const messageContent = {
      [`${messageType}`]: buffer,
      caption: `Berhasil di-steal!\n\nCaption asli: ${caption}`
    };

    await sock.sendMessage(jid, messageContent);
    
    // Delete the file after sending
    await fs.unlink(filePath);
    spinner.succeed(`Stolen ${messageType} from ${chalk.blue(quotedSender.split('@')[0])} in ${chalk.green(isGroup ? groupSubject : 'Private Chat')}`);

  } catch (error) {
    console.error("Error in steal handler:", chalk.red(error));
    spinner.fail(`Error: ${error.message}`);
    await sock.sendMessage(jid, {
      text: "Terjadi kesalahan saat mencoba steal media."
    });
  }
}

// Add this to export the function name and description for menu
export const cmdInfo = {
  name: "steal",
  description: "Steal media dari view once atau status"
};