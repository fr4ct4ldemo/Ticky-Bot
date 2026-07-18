const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageFlags } = require('discord.js');
const prisma = require('../../lib/prisma');
const { buildEmbed, getEmbedColor } = require('../../lib/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('guild-info')
    .setDescription('Inspect a guild configuration')
    .addStringOption((option) => option.setName('guild-id').setDescription('Guild ID').setRequired(true)),
  async execute(interaction) {
    if (interaction.user.id !== process.env.BOT_OWNER_ID) {
      const embed = buildEmbed({ title: '⛔ Forbidden', description: 'Only the bot owner can use this command.', color: getEmbedColor('error') });
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    try {
      const guildId = interaction.options.getString('guild-id');
      const guild = await prisma.guild.findUnique({ where: { guildId } });
      const embed = buildEmbed({
        title: '🧾 Guild Info',
        description: guild ? 'Guild configuration found.' : 'No configuration found for that guild.',
        color: guild ? getEmbedColor('success') : getEmbedColor('warning'),
        fields: [
          { name: 'Guild ID', value: guildId, inline: false },
          { name: 'Locale', value: guild?.locale || 'n/a', inline: true },
          { name: 'Theme Color', value: guild?.themeColor?.toString() || 'n/a', inline: true },
        ],
      });
      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    } catch (error) {
      console.error('Error in /guild-info:', error);
      const fallback = buildEmbed({ title: '❌ Error', description: 'Unable to inspect that guild.', color: getEmbedColor('error') });
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ embeds: [fallback], flags: MessageFlags.Ephemeral });
      } else {
        await interaction.editReply({ embeds: [fallback] });
      }
    }
  },
};
