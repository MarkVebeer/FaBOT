const DEV_USER_IDS = process.env.DEV_USER_IDS ? process.env.DEV_USER_IDS.split(',') : [];

module.exports = function(client) {
    client.on('interactionCreate', async interaction => {
        if (!interaction.isCommand()) return;
        const command = client.commands.get(interaction.commandName);
        if (!command) return;

        // devonly ellenőrzés
        if (command.devonly === true && !DEV_USER_IDS.includes(interaction.user.id)) {
            await interaction.reply({ content: 'Ez a parancs csak fejlesztőknek elérhető!', flags: 64 });
            return;
        }

        try {
            await command.execute(interaction);
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: 'Hiba történt a parancs futtatásakor!', flags: 64 });
        }
    });
}
