const prisma = require('../lib/prisma');
const { buildEmbed, getEmbedColor } = require('../lib/embeds');
const { closeTicket } = require('../lib/tickets');
const { WARNING_LEAD_MS } = require('../lib/inactivity');

/**
 * Scans every guild's active tickets for inactivity:
 *  - Tickets within WARNING_LEAD_MS of their auto-close deadline get a
 *    one-time "closing soon" notice posted in-channel.
 *  - Tickets past their auto-close deadline get closed automatically
 *    (transcript + notification, same as a manual /close).
 *
 * Requires the logged-in `client` so it can resolve guilds/channels for
 * tickets that may belong to any server the bot is in.
 */
async function runInactivityCheck(client) {
  const now = new Date();
  let warned = 0;
  let closed = 0;

  // --- Warnings: approaching the auto-close deadline, not yet warned ---
  const approaching = await prisma.inactivityState.findMany({
    where: {
      state: 'ACTIVE',
      warningSentAt: null,
      autoCloseAt: { gt: now, lte: new Date(now.getTime() + WARNING_LEAD_MS) },
    },
    include: { ticket: true },
  });

  for (const inactivityState of approaching) {
    const ticket = inactivityState.ticket;
    if (!ticket || ticket.status !== 'OPEN' || !ticket.channelId) continue;

    try {
      const guild = await client.guilds.fetch(ticket.guildId).catch(() => null);
      const channel = guild ? await guild.channels.fetch(ticket.channelId).catch(() => null) : null;

      if (channel?.isTextBased?.()) {
        const embed = buildEmbed({
          title: '⏰ Closing Soon',
          description: `This ticket has been inactive for a while and will automatically close in about ${Math.round(WARNING_LEAD_MS / 60000)} minutes if no one replies.`,
          color: getEmbedColor('warning'),
        });
        await channel.send({ embeds: [embed] }).catch(() => {});
      }

      await prisma.inactivityState.update({
        where: { id: inactivityState.id },
        data: { warningSentAt: now },
      });
      warned += 1;
    } catch (error) {
      console.warn('Inactivity warning failed for ticket:', ticket?.id, error.message);
    }
  }

  // --- Auto-close: past the deadline ---
  const overdue = await prisma.inactivityState.findMany({
    where: {
      state: 'ACTIVE',
      autoCloseAt: { lte: now },
    },
    include: { ticket: true },
  });

  for (const inactivityState of overdue) {
    const ticket = inactivityState.ticket;

    // Ticket was already closed some other way (manual /close, button,
    // deleted, etc) — just stop tracking it and move on.
    if (!ticket || ticket.status !== 'OPEN') {
      await prisma.inactivityState.update({ where: { id: inactivityState.id }, data: { state: 'CLOSED' } }).catch(() => {});
      continue;
    }

    try {
      const guild = await client.guilds.fetch(ticket.guildId).catch(() => null);
      if (!guild) continue;

      await closeTicket({
        guild,
        ticket,
        reason: 'Automatically closed due to inactivity (no replies in 2 hours).',
        closedByUserId: client.user.id,
      });

      await prisma.inactivityState.update({ where: { id: inactivityState.id }, data: { state: 'CLOSED' } });
      closed += 1;
    } catch (error) {
      console.warn('Inactivity auto-close failed for ticket:', ticket?.id, error.message);
    }
  }

  return { warned, closed };
}

module.exports = { runInactivityCheck };
