# Alawi Bot

Alawi Bot is a WhatsApp bot built using [Baileys](https://github.com/adiwajshing/Baileys), a Node.js library for interacting with the WhatsApp Web API. This bot comes with several features, including tagging all group members, hiding tags, and converting images and stickers.

## Features

- **Tag All**: Mention all members in a group.
- **Hidetag**: Send messages without showing @mentions.
- **Sticker Creation**: Reply to images, GIFs, and MP4s to create stickers.
- **Sticker to Image**: Convert stickers back to images.
- **Menu**: Display all available commands and features.

## Requirements

Before running the bot, ensure you have the following installed on your machine:

- [Node.js](https://nodejs.org/en/) (version 14 or later)
- npm (comes with Node.js)

## Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/yourusername/alawi-bot.git
   cd alawi-bot
   ```

2. Install the required dependencies:

   ```bash
   npm install
   ```

3. Create a directory for storing authentication sessions:

   ```bash
   mkdir .auth_sessions
   ```

## Usage

1. Run the bot:

   ```bash
   node index.js
   ```

2. Scan the QR code displayed in the terminal using your WhatsApp application.

3. Use the following commands in your WhatsApp chat:

   - **`.tagall`**: Mention all group members.
   - **`.hidetag [message]`**: Send a message without showing @mentions.
   - **`.sticker`**: Reply to an image, GIF, or MP4 to create a sticker.
   - **`.toimg`**: Quote a sticker to convert it back to an image.
   - **`.menu`**: Display all available commands.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [Baileys](https://github.com/adiwajshing/Baileys) for the WhatsApp Web API.
- [Ora](https://github.com/sindresorhus/ora) for the spinner.
- [Chalk](https://github.com/chalk/chalk) for terminal string styling.
- [Sharp](https://github.com/lovell/sharp) for image processing.
- [Figlet](https://github.com/patorjk/figlet.js) for ASCII art generation.

## Contact

Developed by [Reza Alawi](https://github.com/rezaalawii). Feel free to connect on [Instagram](https://www.instagram.com/rezalawiii) or [TikTok](https://www.tiktok.com/@reza_alawi).


### Instructions
1. Replace `https://github.com/yourusername/alawi-bot.git` with the actual URL of your GitHub repository.
2. Make sure the features, commands, and contact links reflect your preferences or changes.
3. Save this as `README.md` in the root of your project directory.

Feel free to ask if you need any adjustments!
