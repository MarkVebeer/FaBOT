require('dotenv').config();
const { Client, GatewayIntentBits, DefaultWebSocketManagerOptions } = require('discord.js');
//szia
// Create a new client instance
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
    ]
});
const commandHandler = require('./commandHandler');
const interactionHandler = require('./interactionHandler');

// Commandok betöltése és regisztrálása
commandHandler.loadCommands(client);
commandHandler.registerCommands(
    client,
    process.env.DISCORD_TOKEN,
    process.env.CLIENT_ID
);
interactionHandler(client);

client.once('clientReady', () => {
    console.log('A faóra készenáll a termeszekre!');
});

// Login to Discord with your client's token
client.login(process.env.DISCORD_TOKEN);