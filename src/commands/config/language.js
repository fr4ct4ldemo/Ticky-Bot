const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageFlags } = require('discord.js');
const prisma = require('../../lib/prisma');
const { buildEmbed, getEmbedColor } = require('../../lib/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('language')
    .setDescription('Set the guild language')
    .addSubcommand((subcommand) => subcommand.setName('set').setDescription('Set the locale').addStringOption((option) => option.setName('locale').setDescription('Locale code').setRequired(true))),
  async execute(interaction) {
    if (!interaction.guildId) {
      const embed = buildEmbed({ title: '❌ Guild Required', description: 'This command can only be used inside a server.', color: getEmbedColor('error') });
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    try {
      const locale = interaction.options.getString('locale');
      await prisma.guild.upsert({
        where: { guildId: interaction.guildId },
        update: { locale },
        create: { guildId: interaction.guildId, locale },
      });

      const embed = buildEmbed({ title: '🌐 Language Updated', description: `The guild locale is now **${locale}**.`, color: getEmbedColor('success') });
      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    } catch (error) {
      console.error('Error in /language set:', error);
      const fallback = buildEmbed({ title: '❌ Error', description: 'Unable to update the guild language.', color: getEmbedColor('error') });
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ embeds: [fallback], flags: MessageFlags.Ephemeral });
      } else {
        await interaction.editReply({ embeds: [fallback] });
      }
    }
  },
};
