const { Events } = require('discord.js');
const prisma = require('../lib/prisma');
const { touchTicketActivity } = require('../lib/inactivity');

module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    // Ignore DMs, bots (including this bot's own ticket-embed/system
    // messages), and webhook messages — only real human replies should
    // reset the inactivity countdown.
    if (!message.guildId || message.author?.bot || message.webhookId) return;

    try {
      const ticket = await prisma.ticket.findFirst({
        where: { guildId: message.guildId, channelId: message.channelId, status: 'OPEN' },
      });

      if (!ticket) return;

      await touchTicketActivity({ ticket });
    } catch (error) {
      console.warn('Failed to refresh inactivity timer for channel:', message.channelId, error.message);
    }
  },
};
