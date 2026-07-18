const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageFlags } = require('discord.js');
const prisma = require('../../lib/prisma');
const { buildEmbed, getEmbedColor } = require('../../lib/embeds');
const { canManageTicket } = require('../../lib/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('priority')
    .setDescription('Manage ticket priority')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('set')
        .setDescription('Set ticket priority')
        .addStringOption((option) =>
          option
            .setName('value')
            .setDescription('Priority')
            .setRequired(true)
            .addChoices(
              { name: 'Low', value: 'LOW' },
              { name: 'Medium', value: 'MEDIUM' },
              { name: 'High', value: 'HIGH' },
              { name: 'Urgent', value: 'URGENT' },
            ),
        ),
    ),
  async execute(interaction) {
    if (!interaction.guildId) {
      const embed = buildEmbed({ title: '❌ Guild Required', description: 'This command can only be used inside a server.', color: getEmbedColor('error') });
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    try {
      const ticket = await prisma.ticket.findFirst({
        where: { guildId: interaction.guildId, channelId: interaction.channelId, status: 'OPEN' },
        include: { category: true },
      });

      if (!ticket) {
        const embed = buildEmbed({ title: '❌ No Ticket Here', description: 'This command must be used inside an open ticket channel.', color: getEmbedColor('error') });
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }

      if (!(await canManageTicket(interaction.member, ticket))) {
        const embed = buildEmbed({ title: '⛔ Forbidden', description: 'Only staff can set ticket priority.', color: getEmbedColor('error') });
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }

      const value = interaction.options.getString('value') || 'MEDIUM';
      await prisma.ticket.update({ where: { id: ticket.id }, data: { priority: value } });

      const embed = buildEmbed({ title: '⚑ Priority Updated', description: `Priority set to **${value}**.`, color: getEmbedColor('neutral') });
      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      console.error('Error in /priority:', error);
      const fallback = buildEmbed({ title: '❌ Error', description: 'Unable to update priority.', color: getEmbedColor('error') });
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ embeds: [fallback], flags: MessageFlags.Ephemeral });
      } else {
        await interaction.editReply({ embeds: [fallback] });
      }
    }
  },
};
