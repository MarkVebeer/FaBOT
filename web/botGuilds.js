const { Client, GatewayIntentBits } = require('discord.js');
require('dotenv').config({ path: '../.env' });

const botClient = new Client({
    intents: [GatewayIntentBits.Guilds]
});

let isReady = false;
botClient.once('clientReady', () => {
    isReady = true;
});
botClient.login(process.env.DISCORD_TOKEN);

async function getBotGuilds() {
    if (!isReady) return [];
    // Friss lekérés minden híváskor
    return botClient.guilds.cache.map(guild => ({
        id: guild.id,
        name: guild.name,
        icon: guild.icon
    }));
}

module.exports = { getBotGuilds };
