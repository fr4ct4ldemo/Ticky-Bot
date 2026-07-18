const prisma = require('./prisma');

// How long a ticket channel can go without a new message before it's
// auto-closed, and how long before that deadline to post a heads-up
// warning in the channel.
const INACTIVITY_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 hours
const WARNING_LEAD_MS = 15 * 60 * 1000; // warn 15 minutes before auto-close

/**
 * (Re)starts the inactivity countdown for a ticket. Call this whenever the
 * ticket is created and whenever a new message lands in its channel — it
 * pushes `autoCloseAt` INACTIVITY_TIMEOUT_MS into the future and clears any
 * previously-sent warning so a fresh warning can fire again later.
 */
async function touchTicketActivity({ ticket }) {
  if (!ticket?.id) return null;

  const now = new Date();
  const autoCloseAt = new Date(now.getTime() + INACTIVITY_TIMEOUT_MS);

  const existing = await prisma.inactivityState.findFirst({ where: { ticketId: ticket.id } });

  if (existing) {
    return prisma.inactivityState.update({
      where: { id: existing.id },
      data: { autoCloseAt, warningSentAt: null, state: 'ACTIVE' },
    });
  }

  return prisma.inactivityState.create({
    data: {
      guildId: ticket.guildId,
      ticketId: ticket.id,
      categoryId: ticket.categoryId || null,
      autoCloseAt,
      warningSentAt: null,
      state: 'ACTIVE',
    },
  });
}

/**
 * Stops tracking a ticket for inactivity (e.g. it was closed manually).
 */
async function clearTicketActivity(ticketId) {
  if (!ticketId) return;
  await prisma.inactivityState.updateMany({
    where: { ticketId },
    data: { state: 'CLOSED' },
  });
}

module.exports = { touchTicketActivity, clearTicketActivity, INACTIVITY_TIMEOUT_MS, WARNING_LEAD_MS };
