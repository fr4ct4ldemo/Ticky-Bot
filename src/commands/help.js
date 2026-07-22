const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('@discordjs/builders');
const { AttachmentBuilder } = require('discord.js');
const path = require('node:path');
const { buildEmbed, getEmbedColor } = require('../lib/embeds');
const { SUPPORTED_LOCALES } = require('../lib/i18n');

// Bundled icon attached to every help-menu message and referenced via
// attachment://ticket-icon.png in embed thumbnails/images - Discord
// embeds can't point at a local file path directly, so this is the
// standard way to ship a consistent brand image with the bot. Loaded
// straight from disk (src/image/ticket.png) rather than a base64 string,
// since the previous embedded base64 asset was failing to render.
const ICON_PATH = path.join(__dirname, '..', 'image', 'ticket.png');

function buildIconAttachment() {
  return new AttachmentBuilder(ICON_PATH, { name: 'ticket-icon.png' });
}

function buildHelpMenuSelectRow() {
  const select = new StringSelectMenuBuilder()
    .setCustomId('help-menu-select')
    .setPlaceholder('📖 Select what you need help with')
    .addOptions([
      { label: 'Commands', description: "Browse through the bot's command list", value: 'commands', emoji: { name: '📟' } },
      { label: 'FAQ', description: 'Solutions for the most frequent questions', value: 'faq', emoji: { name: '💬' } },
      { label: 'Setup', description: 'Steps to follow when setting up the bot', value: 'setup', emoji: { name: '🔧' } },
    ]);
  return new ActionRowBuilder().addComponents(select);
}

function buildHelpHomeEmbed(client) {
  return buildEmbed({
    authorName: `${client.user.username} Help Menu`,
    authorIconUrl: client.user.displayAvatarURL(),
    title: '👋 Welcome',
    description:
      `**${client.user.username}** is a ticket support bot for your server.\n` +
      `Explore its features below, or pick an option from the menu.`,
    color: getEmbedColor('brand'),
    thumbnailUrl: 'attachment://ticket-icon.png',
    fields: [
      { name: '📟  Commands', value: "Browse through the bot's command list and find new utilities.", inline: true },
      { name: '💬  FAQ', value: 'Solutions for the most frequent questions.', inline: true },
      { name: '🔧  Setup', value: 'Steps to follow when setting up the bot.', inline: true },
    ],
    footerText: `${client.user.username} • Support you can count on`,
    footerIconUrl: client.user.displayAvatarURL(),
  });
}

// Maps command names to the section they should appear under in /help.
// Keep this in sync with src/commands/<group>/*.js.
const COMMAND_GROUPS = [
  {
    label: '🎫 Tickets',
    commands: ['new', 'claim', 'close', 'transfer', 'priority', 'ticket-panel'],
  },
  {
    label: 'Server Config',
    commands: ['language'],
  },
  {
    label: 'Admin',
    commands: ['broadcast', 'guild-info'],
  },
  {
    label: 'General',
    commands: ['help'],
  },
];

function formatCommand(command) {
  const subcommands = (command.options || []).filter((opt) => opt.type === 1);
  const usage = subcommands.length
    ? subcommands.map((sub) => `\`/${command.name} ${sub.name}\``).join(', ')
    : `\`/${command.name}\``;
  return `${usage}  —  ${command.description}`;
}

function buildCommandsEmbed(client) {
  const commands = [...client.commands.values()].map((c) => c.data.toJSON());
  const byName = new Map(commands.map((c) => [c.name, c]));

  const fields = [];
  const seen = new Set();

  for (const group of COMMAND_GROUPS) {
    const groupCommands = group.commands
      .map((name) => byName.get(name))
      .filter(Boolean);

    if (!groupCommands.length) continue;

    groupCommands.forEach((c) => seen.add(c.name));

    fields.push({
      name: group.label,
      value: groupCommands.map(formatCommand).join('\n'),
      inline: false,
    });
  }

  // Anything not assigned to a group (e.g. a newly added command) still shows up here,
  // so /help never silently drops a command.
  const leftover = commands.filter((c) => !seen.has(c.name));
  if (leftover.length) {
    fields.push({
      name: 'Other',
      value: leftover.map(formatCommand).join('\n'),
      inline: false,
    });
  }

  return buildEmbed({
    authorName: `${client.user.username} Help Menu`,
    authorIconUrl: client.user.displayAvatarURL(),
    title: 'Commands',
    description: commands.length ? '─'.repeat(36) : 'No commands are currently registered.',
    fields,
    color: getEmbedColor('brand'),
    thumbnailUrl: 'attachment://ticket-icon.png',
    footerText: `${commands.length} command${commands.length === 1 ? '' : 's'} • Use /help command:<name> for details`,
    footerIconUrl: client.user.displayAvatarURL(),
  });
}

const FAQ_ENTRIES = [
  {
    question: 'How do I create a panel?',
    answer: 'Run `/ticket-panel create title:<title> description:<description>`. You can also set `style` to `Dropdown menu`, `Buttons`, or `Both`, and pick a `channel` to post it in (defaults to the current channel).',
  },
  {
    question: 'How does a user open a ticket from a panel?',
    answer: 'They pick a category from the panel — either from the dropdown or by clicking a category button. A ticket is created for them right away and they get a confirmation with a Close button.',
  },
  {
    question: 'Can a user open more than one ticket at a time?',
    answer: 'No — currently each user can only have one open ticket per server at a time. They need to close their existing ticket before opening another.',
  },
  {
    question: 'How do I close a ticket?',
    answer: 'The ticket opener can run `/close reason:<optional reason>` to close their own open ticket.',
  },
  {
    question: 'How do I list or delete existing panels?',
    answer: 'Use `/ticket-panel list` or `/ticket-panel delete name:<name>`.',
  },
  {
    question: 'What happens to a panel message if I delete the panel?',
    answer: '`/ticket-panel delete` removes the panel from the bot\'s database and also deletes the posted panel message from the channel, if it still exists.',
  },
  {
    question: 'How do I set the server language?',
    answer: 'Run `/language set locale:<code>` with a locale code, e.g. `en` for English or `es` for Spanish. It applies to the whole server, not per-user, and requires the Manage Server permission.',
  },
  {
    question: 'What languages are supported?',
    answer: `Currently supported: ${Object.entries(SUPPORTED_LOCALES).map(([code, name]) => `\`${code}\` (${name})`).join(', ')}. More languages are on the way.`,
  },
];

function buildFaqListEmbed(client) {
  const description =
    'Identify the number of your question and select it using the menu below.\n\n' +
    FAQ_ENTRIES.map((entry, index) => `**${index}.** ${entry.question}`).join('\n');

  return buildEmbed({
    authorName: `${client.user.username} Help Menu`,
    authorIconUrl: client.user.displayAvatarURL(),
    title: '💬 Frequently Asked Questions',
    description,
    color: getEmbedColor('brand'),
    thumbnailUrl: 'attachment://ticket-icon.png',
    footerText: `${client.user.username} • Support you can count on`,
    footerIconUrl: client.user.displayAvatarURL(),
  });
}

function buildFaqAnswerEmbed(client, index) {
  const entry = FAQ_ENTRIES[index];

  return buildEmbed({
    authorName: `${client.user.username} Help Menu`,
    authorIconUrl: client.user.displayAvatarURL(),
    title: `💬 ${entry.question}`,
    description: entry.answer,
    color: getEmbedColor('brand'),
    thumbnailUrl: 'attachment://ticket-icon.png',
    footerText: 'Select another question below, or go back to the main help menu.',
    footerIconUrl: client.user.displayAvatarURL(),
  });
}

function buildFaqSelectRow() {
  const select = new StringSelectMenuBuilder()
    .setCustomId('help-faq-select')
    .setPlaceholder('Select your question')
    .addOptions([
      ...FAQ_ENTRIES.map((entry, index) => ({
        label: `${index}. ${entry.question}`.slice(0, 100),
        value: String(index),
      })),
      { label: 'Back to help menu', value: 'back', emoji: { name: '🔙' } },
    ]);
  return new ActionRowBuilder().addComponents(select);
}

function buildSetupEmbed(client) {
  return buildEmbed({
    authorName: `${client.user.username} Help Menu`,
    authorIconUrl: client.user.displayAvatarURL(),
    title: '🔧 Setup',
    description:
      '**Quick setup steps**\n\n' +
      '**1.** Create a panel so users can open tickets — `/ticket-panel create` (categories are set up automatically)\n' +
      '**2.** *(Optional)* Set your server language — `/language set`',
    color: getEmbedColor('brand'),
    thumbnailUrl: 'attachment://ticket-icon.png',
    footerText: `${client.user.username} • Support you can count on`,
    footerIconUrl: client.user.displayAvatarURL(),
  });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show all available commands')
    .addStringOption((option) =>
      option.setName('command').setDescription('Get details on a specific command').setRequired(false),
    ),
  async execute(interaction, client) {
    const commandName = interaction.options.getString('command');

    if (commandName) {
      const command = client.commands.get(commandName.replace(/^\//, ''));

      if (!command) {
        const embed = buildEmbed({
          title: '❌ Command Not Found',
          description: `No command named \`/${commandName}\` was found. Run \`/help\` with no options to see the full list.`,
          color: getEmbedColor('error'),
        });
        return interaction.reply({ embeds: [embed] });
      }

      const json = command.data.toJSON();
      const subcommands = (json.options || []).filter((opt) => opt.type === 1);

      const embed = buildEmbed({
        title: `🔎 /${json.name}`,
        description: json.description,
        color: getEmbedColor('brand'),
        fields: subcommands.length
          ? subcommands.map((sub) => ({ name: `/${json.name} ${sub.name}`, value: sub.description || 'No description', inline: false }))
          : [],
      });
      return interaction.reply({ embeds: [embed] });
    }

    const embed = buildHelpHomeEmbed(client);
    const selectRow = buildHelpMenuSelectRow();
    await interaction.reply({ embeds: [embed], components: [selectRow], files: [buildIconAttachment()] });
  },
  // Exported so the select-menu/button handlers can build the same section embeds.
  buildHelpHomeEmbed,
  buildCommandsEmbed,
  buildFaqListEmbed,
  buildFaqAnswerEmbed,
  buildFaqSelectRow,
  buildSetupEmbed,
  buildHelpMenuSelectRow,
  buildIconAttachment,
};
