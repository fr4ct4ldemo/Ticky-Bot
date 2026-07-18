const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageFlags } = require('discord.js');
const prisma = require('../../lib/prisma');
const { buildEmbed, getEmbedColor } = require('../../lib/embeds');

module.exports = {
  data: new SlashCommandBuilder().setName('broadcast').setDescription('Broadcast an admin announcement').addStringOption((option) => option.setName('message').setDescription('Announcement text').setRequired(true)),
  async execute(interaction) {
    if (interaction.user.id !== process.env.BOT_OWNER_ID) {
      const embed = buildEmbed({ title: '⛔ Forbidden', description: 'Only the bot owner can use this command.', color: getEmbedColor('error') });
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    const message = interaction.options.getString('message');
    await interaction.deferReply();

    // Broadcast to every channel that has a ticket panel posted in it, across
    // every guild the bot is in. Dedupe by channelId in case a guild has more
    // than one panel in the same channel.
    const panels = await prisma.panel.findMany();
    const targetChannelIds = [...new Set(panels.map((panel) => panel.channelId))];

    const announcementEmbed = buildEmbed({
      title: '📢 Announcement',
      description: message,
      color: getEmbedColor('neutral'),
    });

    let sent = 0;
    let failed = 0;

    for (const channelId of targetChannelIds) {
      try {
        const channel = await interaction.client.channels.fetch(channelId);
        if (!channel || !channel.isTextBased()) {
          failed += 1;
          continue;
        }
        await channel.send({ embeds: [announcementEmbed] });
        sent += 1;
      } catch (error) {
        console.error(`Broadcast: failed to send to channel ${channelId}:`, error);
        failed += 1;
      }
    }

    const resultDescription = `Delivered to **${sent}** panel channel${sent === 1 ? '' : 's'}.${failed ? ` Failed for ${failed}.` : ''}`;
    const resultEmbed = buildEmbed({
      title: '📢 Broadcast Sent',
      description: resultDescription,
      color: getEmbedColor(failed && !sent ? 'error' : 'success'),
    });

    await interaction.editReply({ embeds: [resultEmbed] });
  },
};
