const { MessageFlags } = require('discord.js');
const prisma = require('../lib/prisma');
const { buildEmbed, getEmbedColor } = require('../lib/embeds');
const { openTicketForCategory } = require('./selectMenuHandler');
const { closeTicket, buildTicketEmbed, buildTicketActionRow } = require('../lib/tickets');
const { hasStaffPermission } = require('../lib/permissions');

async function handleButton(interaction) {
  const [action, payload] = interaction.customId.split(':');

  if (action === 'ticket-panel-button') {
    try {
      return await openTicketForCategory(interaction, payload);
    } catch (error) {
      console.error('Error opening ticket from panel button:', error);
      const fallback = buildEmbed({ title: '❌ Error', description: 'Unable to open a ticket for that category.', color: getEmbedColor('error') });
      if (!interaction.replied && !interaction.deferred) {
        return interaction.reply({ embeds: [fallback], flags: MessageFlags.Ephemeral });
      }
      return interaction.editReply({ embeds: [fallback] });
    }
  }

  // The Claim / Unclaim buttons on ticket-opened messages (customId `claim:<ticketId>` / `unclaim:<ticketId>`)
  if (action === 'claim' || action === 'unclaim') {
    const ticketId = payload;
    try {
      const ticket = await prisma.ticket.findUnique({ where: { id: ticketId }, include: { category: true } });

      if (!ticket || ticket.guildId !== interaction.guildId) {
        const embed = buildEmbed({ title: '❌ Ticket Not Found', description: 'This ticket no longer exists.', color: getEmbedColor('error') });
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }

      if (ticket.status !== 'OPEN') {
        const embed = buildEmbed({ title: 'ℹ️ Ticket Closed', description: 'This ticket is already closed.', color: getEmbedColor('neutral') });
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }

      if (!hasStaffPermission(interaction.member)) {
        const embed = buildEmbed({ title: '⛔ Forbidden', description: 'Only staff can claim or unclaim tickets.', color: getEmbedColor('error') });
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }

      if (action === 'claim') {
        if (ticket.staffUserId) {
          const embed = buildEmbed({ title: '❌ Already Claimed', description: `This ticket is already claimed by <@${ticket.staffUserId}>.`, color: getEmbedColor('error') });
          return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }
        ticket.staffUserId = interaction.user.id;
      } else {
        if (!ticket.staffUserId) {
          const embed = buildEmbed({ title: '❌ Not Claimed', description: 'This ticket is not currently claimed.', color: getEmbedColor('error') });
          return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }
        ticket.staffUserId = null;
      }

      await prisma.ticket.update({ where: { id: ticket.id }, data: { staffUserId: ticket.staffUserId } });

      const guildConfig = await prisma.guild.findUnique({ where: { guildId: interaction.guildId } });
      const embed = buildTicketEmbed({ ticket, guildConfig });
      const row = buildTicketActionRow(ticket);

      return await interaction.update({ embeds: [embed], components: [row] });
    } catch (error) {
      console.error(`Error handling ${action} button:`, error);
      const fallback = buildEmbed({ title: '❌ Error', description: `Unable to ${action} that ticket.`, color: getEmbedColor('error') });
      if (!interaction.replied && !interaction.deferred) {
        return interaction.reply({ embeds: [fallback], flags: MessageFlags.Ephemeral });
      }
      return interaction.editReply({ embeds: [fallback] });
    }
  }

  // The "close" button on ticket-opened messages (customId `close:<ticketId>`)
  if (action === 'close') {
    const ticketId = payload;
    try {
      const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });

      if (!ticket || ticket.guildId !== interaction.guildId) {
        const embed = buildEmbed({ title: '❌ Ticket Not Found', description: 'This ticket no longer exists.', color: getEmbedColor('error') });
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }

      if (ticket.status !== 'OPEN') {
        const embed = buildEmbed({ title: 'ℹ️ Already Closed', description: 'This ticket has already been closed.', color: getEmbedColor('neutral') });
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }

      const isOpener = ticket.openerId === interaction.user.id;
      const isStaff = hasStaffPermission(interaction.member);

      if (!isOpener && !isStaff) {
        const embed = buildEmbed({ title: '⛔ Forbidden', description: 'Only the ticket opener or staff can close this ticket.', color: getEmbedColor('error') });
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }

      await interaction.reply({
        embeds: [buildEmbed({ title: '🔒 Ticket Closed', description: 'This ticket has been closed. The channel will be deleted shortly.', color: getEmbedColor('close') })],
        flags: MessageFlags.Ephemeral,
      });

      await closeTicket({ guild: interaction.guild, ticket, reason: 'Closed via button', closedByUserId: interaction.user.id });
    } catch (error) {
      console.error('Error closing ticket via button:', error);
      const fallback = buildEmbed({ title: '❌ Error', description: 'Unable to close that ticket.', color: getEmbedColor('error') });
      if (!interaction.replied && !interaction.deferred) {
        return interaction.reply({ embeds: [fallback], flags: MessageFlags.Ephemeral });
      }
      return interaction.editReply({ embeds: [fallback] });
    }
    return;
  }

  const embed = buildEmbed({ title: '🖱️ Button Handled', description: 'This button is not fully wired up yet. Use `/close` to close a ticket.', color: getEmbedColor('neutral') });
  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

module.exports = { handleButton };
