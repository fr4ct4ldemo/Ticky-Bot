const { ActionRowBuilder, ButtonBuilder } = require('@discordjs/builders');
const { ButtonStyle } = require('discord.js');
const prisma = require('./prisma');
const { buildEmbed, getEmbedColor } = require('./embeds');
const { uploadTranscriptToTicketPm, buildTranscriptEmbed } = require('./transcripts');
const { clearTicketActivity } = require('./inactivity');
const { t, DEFAULT_LOCALE } = require('./i18n');

/**
 * Turns a category name + Discord username into a valid, readable channel
 * name like "general-support-someuser". Discord channel names must be
 * lowercase and only contain letters, numbers, and hyphens (max 100 chars).
 */
function slugifyForChannel(str) {
  return String(str)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function buildTicketChannelName(categoryName, username) {
  const catSlug = slugifyForChannel(categoryName) || 'ticket';
  const userSlug = slugifyForChannel(username) || 'user';
  let name = `${catSlug}-${userSlug}`;
  if (name.length > 100) {
    name = name.slice(0, 100).replace(/-+$/, '');
  }
  return name;
}

/**
 * Builds the standard "Ticket Opened" embed for a ticket. Expects `ticket`
 * to include its `category` relation (e.g. via `include: { category: true }`,
 * or manually attached right after creation).
 */
function buildTicketEmbed({ ticket, guildConfig }) {
  const locale = guildConfig?.locale || DEFAULT_LOCALE;
  const fields = [
    { name: t(locale, 'ticket.opened.field.category'), value: ticket.category?.name || 'Unknown', inline: true },
    { name: t(locale, 'ticket.opened.field.ticketId'), value: ticket.id, inline: true },
  ];
  if (ticket.staffUserId) {
    fields.push({ name: t(locale, 'ticket.opened.field.claimedBy'), value: `<@${ticket.staffUserId}>`, inline: true });
  }
  return buildEmbed({
    title: t(locale, 'ticket.opened.title'),
    description: t(locale, 'ticket.opened.description', { user: `<@${ticket.openerId}>` }),
    color: getEmbedColor('success'),
    fields,
    footerText: guildConfig?.footerText || 'Ticket bot',
  });
}

/**
 * Builds the Claim/Unclaim + Close button row for a ticket, based on its
 * current claimed state.
 */
function buildTicketActionRow(ticket) {
  const buttons = [];
  if (ticket.staffUserId) {
    buttons.push(new ButtonBuilder().setCustomId(`unclaim:${ticket.id}`).setLabel('Unclaim').setStyle(ButtonStyle.Secondary));
  } else {
    buttons.push(new ButtonBuilder().setCustomId(`claim:${ticket.id}`).setLabel('Claim').setStyle(ButtonStyle.Success));
  }
  buttons.push(new ButtonBuilder().setCustomId(`close:${ticket.id}`).setLabel('Close').setStyle(ButtonStyle.Danger));
  return new ActionRowBuilder().addComponents(buttons);
}

/**
 * Marks a ticket as closed, posts a closing notice in its channel (if any),
 * and deletes that channel after a short delay so people have a moment to
 * see why it's going away.
 */
async function closeTicket({ guild, ticket, reason = 'No reason provided', closedByUserId, locale = DEFAULT_LOCALE }) {
  await prisma.ticket.update({ where: { id: ticket.id }, data: { status: 'CLOSED' } });
  await clearTicketActivity(ticket.id).catch(() => {});

  let transcriptUrl = null;

  try {
    const channel = ticket.channelId ? await guild.channels.fetch(ticket.channelId).catch(() => null) : null;
    const fetchedMessages = channel ? await channel.messages.fetch({ limit: 100 }).catch(() => new Map()) : new Map();
    const orderedMessages = [...fetchedMessages.values()].reverse(); // oldest first
    const transcriptMessages = orderedMessages.map((message) => ({
      id: message.id,
      authorId: message.author?.id,
      authorName: message.author?.username,
      authorAvatar: message.author?.avatar,
      createdAt: message.createdAt,
      content: message.content || '',
      attachments: [...(message.attachments?.values() || [])].map((attachment) => ({
        id: attachment.id,
        filename: attachment.name,
        size: attachment.size,
        url: attachment.url,
      })),
    }));

    const uploadResult = await uploadTranscriptToTicketPm(transcriptMessages, {
      channelId: ticket.channelId,
      channelName: channel?.name,
      guildId: ticket.guildId,
      ticketId: ticket.id,
    });

    transcriptUrl = uploadResult?.url || null;

    await prisma.transcript.create({
      data: {
        guildId: ticket.guildId,
        ticketId: ticket.id,
        objectKey: uploadResult?.id || ticket.id,
        storageUrl: transcriptUrl || '',
      },
    });

    if (ticket.openerId) {
      const openerUser = await guild.client.users.fetch(ticket.openerId).catch(() => null);
      if (openerUser) {
        await openerUser.send({ embeds: [buildTranscriptEmbed({ ticketId: ticket.id, url: transcriptUrl })] }).catch(() => {});
      }
    }

    const logChannelId = process.env.LOG_CHANNEL_ID;
    if (logChannelId) {
      const logChannel = await guild.channels.fetch(logChannelId).catch(() => null);
      if (logChannel?.isTextBased?.()) {
        await logChannel.send({ embeds: [buildTranscriptEmbed({ ticketId: ticket.id, url: transcriptUrl })] }).catch(() => {});
      }
    }
  } catch (error) {
    console.warn('Transcript generation failed for ticket:', ticket.id, error.message);
  }

  if (!ticket.channelId) return;

  try {
    const channel = await guild.channels.fetch(ticket.channelId).catch(() => null);
    if (!channel) return;

    // Lock the channel for the ticket opener right away so they can't keep
    // posting once it's closed — but leave their view access in place for
    // now so they can still read the closing notice below.
    if (ticket.openerId) {
      await channel.permissionOverwrites
        .edit(ticket.openerId, { SendMessages: false, AddReactions: false })
        .catch(() => {});
    }

    await channel
      .send(
        t(locale, 'ticket.closed.channelMessage', { user: `<@${closedByUserId}>`, reason }) +
        (transcriptUrl ? t(locale, 'ticket.closed.channelMessage.transcript', { url: transcriptUrl }) : '') +
        t(locale, 'ticket.closed.channelMessage.deleting'),
      )
      .catch(() => {});

    setTimeout(async () => {
      // Fully revoke the opener's access right before deleting the channel.
      // This is what actually removes their ability to see the channel —
      // it also acts as a safety net if the delete call below ever fails,
      // so they don't end up stuck with lingering access to a closed ticket.
      if (ticket.openerId) {
        await channel.permissionOverwrites.edit(ticket.openerId, { ViewChannel: false }).catch(() => {});
      }
      await channel.delete('Ticket closed').catch(() => {});
    }, 5000);
  } catch (error) {
    // Channel may already be gone (manually deleted, etc) — nothing else to do.
  }
}

module.exports = { closeTicket, buildTicketEmbed, buildTicketActionRow, buildTicketChannelName };
