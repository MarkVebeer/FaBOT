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

// Bot API szerver a dashboard üzenetküldéshez
const express = require('express');
const bodyParser = require('body-parser');
const botApiApp = express();
botApiApp.use(bodyParser.json());

botApiApp.post('/send-message', async (req, res) => {
  const { guildId, channelId, message } = req.body;
  if (!guildId || !channelId || !message) {
    return res.status(400).json({ error: 'Missing parameters' });
  }
  try {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return res.status(404).json({ error: 'Guild not found' });

    const channel = guild.channels.cache.get(channelId);
    if (!channel || !channel.isTextBased()) {
      return res.status(404).json({ error: 'Channel not found or not text-based' });
    }

    await channel.send(message);
    res.json({ success: true });
  } catch (err) {
    console.error('Bot send-message error:', err);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

botApiApp.get('/channels/:guildId', async (req, res) => {
  const { guildId } = req.params;
  try {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return res.status(404).json({ error: 'Guild not found' });

    const textChannels = guild.channels.cache
      .filter(ch => ch.isTextBased() && ch.permissionsFor(guild.members.me).has('SendMessages'))
      .map(ch => ({ id: ch.id, name: ch.name }));
    
    res.json(textChannels);
  } catch (err) {
    console.error('Bot channels error:', err);
    res.status(500).json({ error: 'Failed to fetch channels' });
  }
});botApiApp.listen(5000, () => {
    console.log('Bot API listening on port 5000');
});
