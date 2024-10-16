import chalk from "chalk";
import ora from "ora";

/**
 * Fungsi untuk menangani perintah .tagall
 * @param {object} sock - Instance dari WhatsApp socket
 * @param {string} groupJid - ID grup WhatsApp
 * @param {Array} groupParticipants - Daftar peserta grup
 * @param {string} senderId - ID pengirim pesan
 * @param {string} textMessage - Isi pesan yang diterima
 */
export const handleTagAll = async (sock, groupJid, groupParticipants, senderId, textMessage) => {
  const spinner = ora();

  const isAdminOrOwner = (participants, sender) => {
    const ownerBot = "085156096759@s.whatsapp.net"; // Owner bot's JID
    const isAdmin = participants.some(
      (p) => p.id === sender && (p.admin === "admin" || p.admin === "superadmin")
    );
    return isAdmin || sender === ownerBot;
  };

  if (textMessage && textMessage.startsWith(".tagall")) {
    if (isAdminOrOwner(groupParticipants, senderId)) {
      // Get group metadata to fetch the group name
      let groupName;
      try {
        const groupMetadata = await sock.groupMetadata(groupJid);
        groupName = groupMetadata.subject; // Get the group name
      } catch (error) {
        spinner.fail("Failed to fetch group metadata.");
        console.error("Error fetching group metadata:", error);
        return;
      }

      spinner
        .info(
          `New tagall command requested in group: ${chalk.underline.bold.yellowBright(
            groupName // Use group name here
          )} (${groupParticipants.length} participants)\nMessage: ${textMessage}\n\n`
        )
        .start();

      const messageBody = textMessage.slice(7).trim() || "Tagging all participants!";

      try {
        // Send message with mentions to all group members
        await sock.sendMessage(groupJid, {
          text: messageBody,
          mentions: groupParticipants.map((item) => item.id),
        });

        spinner.succeed("Tagall message sent successfully");
      } catch (error) {
        spinner.fail(`Failed to send tagall message. Error: ${error.toString()}`);
      }
    } else {
      spinner.fail("Tagall command can only be used by group admins or the bot owner.");
    }
  }
};
