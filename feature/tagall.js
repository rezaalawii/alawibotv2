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
    const ownerBot = "6285156096759@s.whatsapp.net"; // Format JID pemilik bot
    const isAdmin = participants.some(
      (p) => p.id === sender && (p.admin === "admin" || p.admin === "superadmin")
    );
    console.log("Sender ID:", sender); // Debugging
    console.log("Owner Bot:", ownerBot); // Debugging
    return isAdmin || sender === ownerBot;
  };  

  if (textMessage && textMessage.startsWith(".tagall")) {
    if (isAdminOrOwner(groupParticipants, senderId)) {
      // Mendapatkan metadata grup untuk mengambil nama grup
      let groupName;
      try {
        const groupMetadata = await sock.groupMetadata(groupJid);
        groupName = groupMetadata.subject; // Ambil nama grup
      } catch (error) {
        spinner.fail("Gagal mendapatkan metadata grup.");
        console.error("Error mengambil metadata grup:", error);
        return;
      }

      spinner
        .info(
          `Perintah tagall baru diminta di grup: ${chalk.underline.bold.yellowBright(
            groupName // Gunakan nama grup di sini
          )} (${groupParticipants.length} anggota)\nPesan: ${textMessage}\n\n`
        )
        .start();

      const messageBody = textMessage.slice(7).trim() || "Everyone!";

      try {
        // Mengirim pesan dengan menyebutkan semua anggota grup
        await sock.sendMessage(groupJid, {
          text: messageBody,
          mentions: groupParticipants.map((item) => item.id),
        });

        spinner.succeed("Pesan tagall berhasil dikirim");
      } catch (error) {
        spinner.fail(`Gagal mengirim pesan tagall. Error: ${error.toString()}`);
      }
    } else {
      // Mengirim notifikasi ke grup
      await sock.sendMessage(groupJid, {
        text: `⚠️ *Perintah tagall hanya dapat digunakan oleh admin grup atau pemilik bot.*`
      });

      spinner.fail("Perintah tagall hanya dapat digunakan oleh admin grup atau pemilik bot."); 
    }
  }
};
