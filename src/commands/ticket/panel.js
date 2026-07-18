const fs = require('fs');
const path = require('path');
const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder } = require('@discordjs/builders');
const { MessageFlags, PermissionFlagsBits, ChannelType, ButtonStyle, AttachmentBuilder } = require('discord.js');
const prisma = require('../../lib/prisma');
const { buildEmbed, getEmbedColor } = require('../../lib/embeds');
const { ensureDefaultCategories } = require('../../lib/categories');

const MAX_BUTTONS_PER_ROW = 5;
const MAX_ROWS = 5;
const MAX_BUTTONS_TOTAL = MAX_BUTTONS_PER_ROW * MAX_ROWS; // 25, one row reserved for the dropdown if "both" is used
const MAX_SELECT_OPTIONS = 25;

// Keep this in sync with the open-ticket check in components/selectMenuHandler.js —
// it's only used here to describe the real limit in the panel copy.
const MAX_ACTIVE_TICKETS_PER_USER = 1;

function buildCategoryButtonRows(categories) {
  const rows = [];
  for (let i = 0; i < categories.length; i += MAX_BUTTONS_PER_ROW) {
    const rowCategories = categories.slice(i, i + MAX_BUTTONS_PER_ROW);
    const row = new ActionRowBuilder().addComponents(
      rowCategories.map((category) => {
        const button = new ButtonBuilder()
          .setCustomId(`ticket-panel-button:${category.id}`)
          .setLabel(category.name.slice(0, 80))
          .setStyle(ButtonStyle.Primary);
        if (category.emoji) button.setEmoji({ name: category.emoji });
        return button;
      }),
    );
    rows.push(row);
  }
  return rows;
}

function buildCategorySelectRow(categories) {
  const select = new StringSelectMenuBuilder()
    .setCustomId('ticket-panel-select')
    .setPlaceholder('Choose a category')
    .addOptions(
      categories.map((category) => ({
        label: category.name.slice(0, 100),
        description: (category.description || 'Open a ticket in this category').slice(0, 100),
        value: category.id,
        emoji: category.emoji ? { name: category.emoji } : undefined,
      })),
    );
  return new ActionRowBuilder().addComponents(select);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket-panel')
    .setDescription('Manage ticket panels')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((subcommand) =>
      subcommand
        .setName('create')
        .setDescription('Create a ticket panel')
        .addStringOption((option) =>
          option
            .setName('style')
            .setDescription('How categories are presented (default: buttons)')
            .setRequired(false)
            .addChoices(
              { name: 'Dropdown menu', value: 'dropdown' },
              { name: 'Buttons', value: 'buttons' },
              { name: 'Both buttons and dropdown', value: 'both' },
            ),
        )
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('Channel to post the panel in (defaults to this channel)')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false),
        )
        .addChannelOption((option) =>
          option
            .setName('category')
            .setDescription('Discord category tickets from this panel should open in (defaults to the panel channel\'s category)')
            .addChannelTypes(ChannelType.GuildCategory)
            .setRequired(false),
        )
        .addRoleOption((option) =>
          option
            .setName('staff_role')
            .setDescription('Discord role that can claim/close/transfer/prioritize tickets from this panel')
            .setRequired(false),
        ),
    )
    .addSubcommand((subcommand) => subcommand.setName('list').setDescription('List ticket panels'))
    .addSubcommand((subcommand) =>
      subcommand
        .setName('delete')
        .setDescription('Delete a ticket panel')
        .addStringOption((option) => option.setName('name').setDescription('Panel name').setRequired(true)),
    ),
  async execute(interaction) {
    if (!interaction.guildId) {
      const embed = buildEmbed({ title: '❌ Guild Required', description: 'This command can only be used inside a server.', color: getEmbedColor('error') });
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    const sub = interaction.options.getSubcommand();
    if (sub === 'create') {
      await interaction.deferReply({ ephemeral: true });
    }

    try {
      await prisma.guild.upsert({
        where: { guildId: interaction.guildId },
        update: {},
        create: { guildId: interaction.guildId },
      });

      if (sub === 'create') {
        const style = interaction.options.getString('style') || 'buttons';
        const targetChannel = interaction.options.getChannel('channel') || interaction.channel;
        const ticketCategoryChannel = interaction.options.getChannel('category') || null;

        const categories = await ensureDefaultCategories(interaction.guildId);
        const staffRole = interaction.options.getRole('staff_role');
        let assignedTeam = null;

        if (staffRole) {
          const existingTeams = await prisma.team.findMany({ where: { guildId: interaction.guildId } });
          assignedTeam = existingTeams.find((team) => {
            try {
              const parsedRoleIds = JSON.parse(team.roleIds);
              return Array.isArray(parsedRoleIds) && parsedRoleIds.includes(staffRole.id);
            } catch {
              return false;
            }
          }) || null;

          if (!assignedTeam) {
            assignedTeam = await prisma.team.create({
              data: {
                guildId: interaction.guildId,
                name: staffRole.name,
                roleIds: JSON.stringify([staffRole.id]),
              },
            });
          }

          await prisma.category.updateMany({
            where: { id: { in: categories.map((category) => category.id) } },
            data: { staffTeamId: assignedTeam.id },
          });
        }

        if ((style === 'dropdown' || style === 'both') && categories.length > MAX_SELECT_OPTIONS) {
          const embed = buildEmbed({
            title: '❌ Too Many Categories',
            description: `This server has ${categories.length} categories, but a dropdown can only show ${MAX_SELECT_OPTIONS}. Use \`style: buttons\` instead.`,
            color: getEmbedColor('error'),
          });
          return interaction.editReply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        if ((style === 'buttons' || style === 'both') && categories.length > MAX_BUTTONS_TOTAL) {
          const embed = buildEmbed({
            title: '❌ Too Many Categories',
            description: `This server has ${categories.length} categories, but buttons can only show ${MAX_BUTTONS_TOTAL} (5 rows × 5). Use \`style: dropdown\` instead.`,
            color: getEmbedColor('error'),
          });
          return interaction.editReply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        // "both" reserves one row for the dropdown, so buttons are capped at 4 rows (20) in that mode.
        const buttonCategories = style === 'both' ? categories.slice(0, MAX_BUTTONS_TOTAL - MAX_BUTTONS_PER_ROW) : categories;

        if (style === 'both' && categories.length > buttonCategories.length) {
          const embed = buildEmbed({
            title: '❌ Too Many Categories',
            description: `"Both" mode reserves one row for the dropdown, leaving room for ${MAX_BUTTONS_TOTAL - MAX_BUTTONS_PER_ROW} button categories max. You have ${categories.length}. Use \`style: dropdown\` instead.`,
            color: getEmbedColor('error'),
          });
          return interaction.editReply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        const panelName = `Ticket Panel — #${targetChannel.name}`;

        const isDropdownOnly = style === 'dropdown';
        const actionText = isDropdownOnly
          ? 'Select an option below to create a ticket'
          : `Click the button${categories.length > 1 || style === 'both' ? 's' : ''} below to create a ticket`;

        const TICKET_ICON_FILENAME = 'ticket-icon.png';
        const ticketIconPath = path.resolve(__dirname, '../../image/ticket.png');
        const panelEmbed = buildEmbed({
          title: 'Create Ticket',
          description:
            `${actionText}\n\n` +
            `*You can only have ${MAX_ACTIVE_TICKETS_PER_USER} active ticket${MAX_ACTIVE_TICKETS_PER_USER === 1 ? '' : 's'} at a time.*`,
          color: getEmbedColor('neutral'),
          footerText: `© ${new Date().getFullYear()} ${interaction.guild.name}`,
          thumbnailUrl: `attachment://${TICKET_ICON_FILENAME}`,
        });

        const ticketIconAttachment = new AttachmentBuilder(fs.readFileSync(ticketIconPath), {
          name: TICKET_ICON_FILENAME,
          contentType: 'image/png',
        });

        const components = [];
        if (style === 'buttons' && categories.length === 1) {
          const soleButton = new ButtonBuilder()
            .setCustomId(`ticket-panel-button:${categories[0].id}`)
            .setLabel('Create Ticket')
            .setEmoji({ name: '🎟️' })
            .setStyle(ButtonStyle.Primary);
          components.push(new ActionRowBuilder().addComponents(soleButton));
        } else {
          if (style === 'buttons' || style === 'both') {
            components.push(...buildCategoryButtonRows(buttonCategories));
          }
          if (style === 'dropdown' || style === 'both') {
            components.push(buildCategorySelectRow(categories));
          }
        }

        const message = await targetChannel.send({ embeds: [panelEmbed], components, files: [ticketIconAttachment] });

        await prisma.panel.create({
          data: {
            guildId: interaction.guildId,
            name: panelName,
            channelId: targetChannel.id,
            messageId: message.id,
            ticketCategoryId: ticketCategoryChannel?.id || null,
          },
        });

        const confirmLines = [`Panel posted in <#${targetChannel.id}>.`];
        if (ticketCategoryChannel) confirmLines.push(`Tickets from this panel will open under **${ticketCategoryChannel.name}**.`);
        if (staffRole) confirmLines.push(`Staff role: <@&${staffRole.id}>`);

        const confirmEmbed = buildEmbed({
          title: '✅ Panel Created',
          description: confirmLines.join('\n'),
          color: getEmbedColor('success'),
        });
        return interaction.editReply({ embeds: [confirmEmbed], flags: MessageFlags.Ephemeral });
      }

      if (sub === 'list') {
        const panels = await prisma.panel.findMany({ where: { guildId: interaction.guildId }, orderBy: { createdAt: 'asc' } });

        if (panels.length === 0) {
          const embed = buildEmbed({ title: '🧩 Ticket Panels', description: 'No panels have been created yet.', color: getEmbedColor('neutral') });
          return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        const embed = buildEmbed({
          title: '🧩 Ticket Panels',
          description: panels
            .map((p) => `**${p.name}** — <#${p.channelId}>${p.ticketCategoryId ? ` (tickets in <#${p.ticketCategoryId}>)` : ''}`)
            .join('\n'),
          color: getEmbedColor('neutral'),
        });
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }

      if (sub === 'delete') {
        const name = interaction.options.getString('name');
        const panel = await prisma.panel.findFirst({ where: { guildId: interaction.guildId, name } });

        if (!panel) {
          const embed = buildEmbed({ title: '❌ Panel Not Found', description: `No panel named **${name}** was found.`, color: getEmbedColor('error') });
          return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        if (panel.messageId) {
          try {
            const channel = await interaction.guild.channels.fetch(panel.channelId);
            const message = await channel?.messages.fetch(panel.messageId);
            await message?.delete();
          } catch (deleteError) {
            // The message or channel may already be gone; continue with DB cleanup regardless.
          }
        }

        await prisma.panel.delete({ where: { id: panel.id } });

        const embed = buildEmbed({ title: '🗑️ Panel Deleted', description: `Panel **${name}** has been deleted.`, color: getEmbedColor('close') });
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }
    } catch (error) {
      console.error(`Error in /ticket-panel ${sub}:`, error);
      const fallback = buildEmbed({ title: '❌ Error', description: 'Unable to complete that panel action.', color: getEmbedColor('error') });
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ embeds: [fallback], flags: MessageFlags.Ephemeral });
      } else {
        await interaction.editReply({ embeds: [fallback] });
      }
    }
  },
};
