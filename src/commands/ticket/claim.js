const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageFlags } = require('discord.js');
const prisma = require('../../lib/prisma');
const { buildEmbed, getEmbedColor } = require('../../lib/embeds');
const { buildTicketEmbed, buildTicketActionRow } = require('../../lib/tickets');
const { canManageTicket } = require('../../lib/permissions');
const { t, DEFAULT_LOCALE } = require('../../lib/i18n');

module.exports = {
  data: new SlashCommandBuilder().setName('claim').setDescription('Claim the current ticket'),
  async execute(interaction) {
    if (!interaction.guildId) {
      const embed = buildEmbed({ title: t(DEFAULT_LOCALE, 'guild.required.title'), description: t(DEFAULT_LOCALE, 'guild.required.description'), color: getEmbedColor('error') });
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    try {
      const guildConfig = await prisma.guild.findUnique({ where: { guildId: interaction.guildId } });
      const locale = guildConfig?.locale || DEFAULT_LOCALE;

      const ticket = await prisma.ticket.findFirst({
        where: { guildId: interaction.guildId, channelId: interaction.channelId, status: 'OPEN' },
        include: { category: true },
      });

      if (!ticket) {
        const embed = buildEmbed({ title: t(locale, 'ticket.claim.noTicketHere.title'), description: t(locale, 'ticket.claim.noTicketHere.description'), color: getEmbedColor('error') });
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }

      if (!(await canManageTicket(interaction.member, ticket))) {
        const embed = buildEmbed({ title: t(locale, 'ticket.claim.forbidden.title'), description: t(locale, 'ticket.claim.forbidden.description'), color: getEmbedColor('error') });
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }

      if (ticket.staffUserId) {
        const embed = buildEmbed({ title: t(locale, 'ticket.claim.alreadyClaimed.title'), description: t(locale, 'ticket.claim.alreadyClaimed.description', { user: `<@${ticket.staffUserId}>` }), color: getEmbedColor('error') });
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }

      ticket.staffUserId = interaction.user.id;
      await prisma.ticket.update({ where: { id: ticket.id }, data: { staffUserId: interaction.user.id } });

      const embed = buildTicketEmbed({ ticket, guildConfig });
      const row = buildTicketActionRow(ticket);

      await interaction.reply({ embeds: [embed], components: [row] });
    } catch (error) {
      console.error('Error in /claim:', error);
      const fallback = buildEmbed({ title: '❌ Error', description: 'Unable to claim that ticket.', color: getEmbedColor('error') });
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ embeds: [fallback], flags: MessageFlags.Ephemeral });
      } else {
        await interaction.editReply({ embeds: [fallback] });
      }
    }
  },
};
