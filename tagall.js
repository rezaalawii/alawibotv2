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

  // Fungsi untuk memeriksa apakah pengirim adalah admin atau owner bot
  const isAdminOrOwner = (participants, sender) => {
    const ownerBot = "085156096759@s.whatsapp.net"; // Nomor owner bot dalam format JID
    const isAdmin = participants.some(
      (p) => p.id === sender && (p.admin === "admin" || p.admin === "superadmin")
    );
    return isAdmin || sender === ownerBot;
  };

  // Pengecekan jika perintah adalah .tagall
  if (textMessage && textMessage.startsWith(".tagall")) {
    // Hanya admin atau owner yang boleh menggunakan perintah ini
    if (isAdminOrOwner(groupParticipants, senderId)) {
      spinner
        .info(
          `New tagall command requested in group: ${chalk.underline.bold.yellowBright(
            groupJid
          )} (${groupParticipants.length} participants)\nMessage: ${textMessage}\n\n`
        )
        .start();

      const messageBody = textMessage.slice(7).trim() || "Tagging all participants!";

      try {
        // Kirim pesan dengan mentions ke semua anggota grup
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
