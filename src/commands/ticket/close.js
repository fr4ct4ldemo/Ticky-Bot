const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageFlags } = require('discord.js');
const prisma = require('../../lib/prisma');
const { buildEmbed, getEmbedColor } = require('../../lib/embeds');
const { closeTicket } = require('../../lib/tickets');
const { canManageTicket } = require('../../lib/permissions');

module.exports = {
  data: new SlashCommandBuilder().setName('close').setDescription('Close the current ticket').addStringOption((option) => option.setName('reason').setDescription('Close reason').setRequired(false)),
  async execute(interaction) {
    if (!interaction.guildId) {
      const embed = buildEmbed({ title: '❌ Guild Required', description: 'This command can only be used inside a server.', color: getEmbedColor('error') });
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    try {
      const reason = interaction.options.getString('reason') || 'No reason provided';

      let ticket = await prisma.ticket.findFirst({
        where: { guildId: interaction.guildId, openerId: interaction.user.id, status: 'OPEN' },
      });

      if (!ticket) {
        const channelTicket = await prisma.ticket.findFirst({
          where: { guildId: interaction.guildId, channelId: interaction.channelId, status: 'OPEN' },
          include: { category: true },
        });

        if (channelTicket && (await canManageTicket(interaction.member, channelTicket))) {
          ticket = channelTicket;
        }
      }

      if (!ticket) {
        const embed = buildEmbed({ title: '❌ Ticket Not Found', description: 'No open ticket was found for you in this server.', color: getEmbedColor('error') });
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }

      await interaction.reply({
        embeds: [buildEmbed({ title: '🔒 Ticket Closed', description: `This ticket was closed.\nReason: ${reason}`, color: getEmbedColor('close') })],
        flags: MessageFlags.Ephemeral,
      });

      await closeTicket({ guild: interaction.guild, ticket, reason, closedByUserId: interaction.user.id });
    } catch (error) {
      console.error('Error in /close:', error);
      const fallback = buildEmbed({ title: '❌ Error', description: 'Unable to close that ticket.', color: getEmbedColor('error') });
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ embeds: [fallback], flags: MessageFlags.Ephemeral });
      } else {
        await interaction.editReply({ embeds: [fallback] });
      }
    }
  },
};
