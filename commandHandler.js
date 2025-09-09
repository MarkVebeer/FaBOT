const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');

const commandHandler = {
    loadCommands(client) {
        client.commands = new Map();
        const commandsPath = path.join(__dirname, 'commands');
        const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
        for (const file of commandFiles) {
            const command = require(path.join(commandsPath, file));
            if (command.name && command.execute) {
                client.commands.set(command.name, command);
            }
        }
    },
    getSlashCommandData(client) {
        return Array.from(client.commands.values()).map(cmd => {
            const data = {
                name: cmd.name,
                description: cmd.description || 'Nincs leírás',
            };
            if (cmd.options) {
                data.options = cmd.options;
            }
            return data;
        });
    },
    async registerCommands(client, token, clientId) {
        const commands = this.getSlashCommandData(client);
        const rest = new REST({ version: '10' }).setToken(token);
        try {
            await rest.put(
                Routes.applicationCommands(clientId),
                { body: commands }
            );
            console.log('Slash parancsok regisztrálva!');
        } catch (error) {
            console.error('Hiba a parancsok regisztrálásakor:', error);
        }
    }
};

module.exports = commandHandler;
