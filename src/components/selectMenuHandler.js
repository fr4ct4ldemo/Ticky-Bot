const { MessageFlags, ChannelType, PermissionFlagsBits } = require('discord.js');
const prisma = require('../lib/prisma');
const { buildEmbed, getEmbedColor } = require('../lib/embeds');
const { buildTicketEmbed, buildTicketActionRow, buildTicketChannelName } = require('../lib/tickets');
const { touchTicketActivity } = require('../lib/inactivity');

/**
 * Figures out which Discord category (channel container) a new ticket
 * channel should be created under. If the panel that spawned this
 * interaction was configured with a specific category (`/ticket-panel
 * create category:`), and that category still exists, use it. Otherwise
 * fall back to whatever category the panel message's own channel is in.
 */
async function resolveTicketParentId(interaction) {
  const fallbackParentId = interaction.channel?.parentId ?? undefined;

  try {
    const panel = await prisma.panel.findFirst({
      where: {
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        ...(interaction.message?.id ? { messageId: interaction.message.id } : {}),
      },
    });

    if (!panel?.ticketCategoryId) return fallbackParentId;

    const configuredCategory = await interaction.guild.channels.fetch(panel.ticketCategoryId).catch(() => null);
    if (configuredCategory?.type === ChannelType.GuildCategory) {
      return configuredCategory.id;
    }
  } catch {
    // Fall through to the default below.
  }

  return fallbackParentId;
}

/**
 * Opens a ticket for the given category on behalf of interaction.user.
 * Shared by both the panel dropdown and panel button handlers so the
 * ticket-creation logic (and its guard rails) only lives in one place.
 */
async function openTicketForCategory(interaction, categoryId) {
  const category = await prisma.category.findUnique({ where: { id: categoryId } });

  if (!category || category.guildId !== interaction.guildId) {
    const embed = buildEmbed({ title: '❌ Category Not Found', description: 'That category no longer exists.', color: getEmbedColor('error') });
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  const existingOpen = await prisma.ticket.findFirst({
    where: { guildId: interaction.guildId, openerId: interaction.user.id, status: 'OPEN' },
  });

  if (existingOpen) {
    const embed = buildEmbed({
      title: '❌ Ticket Already Open',
      description: 'You already have an open ticket. Please close it before opening another.',
      color: getEmbedColor('error'),
    });
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  const ticket = await prisma.ticket.create({
    data: {
      guildId: interaction.guildId,
      openerId: interaction.user.id,
      categoryId: category.id,
      title: `${category.name} ticket`,
      status: 'OPEN',
    },
  });

  try {
    const guildConfig = await prisma.guild.findUnique({ where: { guildId: interaction.guildId } });

    const parentId = await resolveTicketParentId(interaction);

    const ticketChannel = await interaction.guild.channels.create({
      name: buildTicketChannelName(category.name, interaction.user.username),
      type: ChannelType.GuildText,
      parent: parentId,
      topic: `Ticket opened by ${interaction.user.tag} — ${category.name} • ticket:${ticket.id}`,
      permissionOverwrites: [
        { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
        {
          id: interaction.user.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
        },
        {
          id: interaction.client.user.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
        },
      ],
    });

    await prisma.ticket.update({ where: { id: ticket.id }, data: { channelId: ticketChannel.id } });

    const ticketWithCategory = { ...ticket, category, channelId: ticketChannel.id };
    await touchTicketActivity({ ticket: ticketWithCategory }).catch(() => {});
    const channelEmbed = buildTicketEmbed({ ticket: ticketWithCategory, guildConfig });
    const row = buildTicketActionRow(ticketWithCategory);

    await ticketChannel.send({ content: `<@${interaction.user.id}>`, embeds: [channelEmbed], components: [row] });

    const confirmEmbed = buildEmbed({
      title: '🎫 Ticket Created',
      description: `Your ticket has been created: <#${ticketChannel.id}>`,
      color: getEmbedColor('success'),
    });

    return await interaction.reply({ embeds: [confirmEmbed], flags: MessageFlags.Ephemeral });
  } catch (postCreateError) {
    // Something failed after the ticket row was written (embed/channel/reply/etc) — roll it back
    // so the user isn't left with a phantom "open" ticket blocking future attempts.
    await prisma.ticket.delete({ where: { id: ticket.id } }).catch(() => {});
    throw postCreateError;
  }
}

async function handleTicketPanelSelect(interaction) {
  const categoryId = interaction.values[0];

  try {
    await openTicketForCategory(interaction, categoryId);
  } catch (error) {
    console.error('Error opening ticket from panel select menu:', error);
    const fallback = buildEmbed({ title: '❌ Error', description: 'Unable to open a ticket for that category.', color: getEmbedColor('error') });
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ embeds: [fallback], flags: MessageFlags.Ephemeral });
    } else {
      await interaction.editReply({ embeds: [fallback] });
    }
  }
}

module.exports = { handleTicketPanelSelect, openTicketForCategory };
