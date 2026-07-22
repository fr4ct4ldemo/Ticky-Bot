const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageFlags } = require('discord.js');
const prisma = require('../../lib/prisma');
const { buildEmbed, getEmbedColor } = require('../../lib/embeds');
const { closeTicket } = require('../../lib/tickets');
const { canManageTicket } = require('../../lib/permissions');
const { t, DEFAULT_LOCALE } = require('../../lib/i18n');

module.exports = {
  data: new SlashCommandBuilder().setName('close').setDescription('Close the current ticket').addStringOption((option) => option.setName('reason').setDescription('Close reason').setRequired(false)),
  async execute(interaction) {
    if (!interaction.guildId) {
      const embed = buildEmbed({ title: t(DEFAULT_LOCALE, 'guild.required.title'), description: t(DEFAULT_LOCALE, 'guild.required.description'), color: getEmbedColor('error') });
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    try {
      const guildConfig = await prisma.guild.findUnique({ where: { guildId: interaction.guildId } });
      const locale = guildConfig?.locale || DEFAULT_LOCALE;
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
        const embed = buildEmbed({ title: t(locale, 'ticket.closed.notFound.title'), description: t(locale, 'ticket.closed.notFound.description'), color: getEmbedColor('error') });
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }

      await interaction.reply({
        embeds: [buildEmbed({ title: t(locale, 'ticket.closed.title'), description: t(locale, 'ticket.closed.description', { reason }), color: getEmbedColor('close') })],
        flags: MessageFlags.Ephemeral,
      });

      await closeTicket({ guild: interaction.guild, ticket, reason, closedByUserId: interaction.user.id, locale });
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
