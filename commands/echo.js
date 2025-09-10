module.exports = {
    name: 'echo',
    description: 'Kiír egy üzenetet ugyanabba a csatornába, és ephemerallal válaszol.',
    devonly: true,
    options: [
        {
            name: 'text',
            description: 'A kiírandó üzenet',
            type: 3,
            required: true
        }
    ],
    async execute(interaction) {
        const message = interaction.options.getString('text') || 'Nincs üzenet megadva.';
        await interaction.channel.send(message);
        await interaction.reply({ content: 'Üzenet elküldve!', flags: 64 });
    },
};
