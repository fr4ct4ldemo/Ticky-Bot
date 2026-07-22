const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder } = require('@discordjs/builders');
const { MessageFlags, ButtonStyle } = require('discord.js');
const prisma = require('../../lib/prisma');
const { buildEmbed, getEmbedColor } = require('../../lib/embeds');
const { hasStaffPermission } = require('../../lib/permissions');
const { t, DEFAULT_LOCALE } = require('../../lib/i18n');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('new')
    .setDescription('Open a new support ticket')
    .addStringOption((option) => option.setName('category').setDescription('Ticket category').setRequired(true))
    .addStringOption((option) => option.setName('subject').setDescription('Short subject').setRequired(true)),
  async execute(interaction) {
    const guildId = interaction.guildId;
    if (!guildId) {
      const embed = buildEmbed({ title: t(DEFAULT_LOCALE, 'guild.required.title'), description: t(DEFAULT_LOCALE, 'guild.required.description'), color: getEmbedColor('error') });
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    try {
      const categoryName = interaction.options.getString('category');
      const subject = interaction.options.getString('subject');
      let guild = await prisma.guild.findUnique({ where: { guildId } });
      if (!guild) {
        guild = await prisma.guild.create({ data: { guildId } });
      }
      const locale = guild?.locale || DEFAULT_LOCALE;

      const category = await prisma.category.findFirst({ where: { guildId, name: categoryName } });
      if (!category) {
        const embed = buildEmbed({ title: t(locale, 'ticket.new.categoryNotFound.title'), description: t(locale, 'ticket.new.categoryNotFound.description', { category: categoryName }), color: getEmbedColor('error') });
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }

      const ticket = await prisma.ticket.create({
        data: {
          guildId,
          openerId: interaction.user.id,
          categoryId: category.id,
          title: subject,
          status: 'OPEN',
        },
      });

      const embed = buildEmbed({
        title: t(locale, 'ticket.opened.title'),
        description: t(locale, 'ticket.opened.description.new', { category: category.name }),
        color: getEmbedColor('success'),
        fields: [
          { name: t(locale, 'ticket.opened.field.subject'), value: subject, inline: false },
          { name: t(locale, 'ticket.opened.field.ticketId'), value: ticket.id, inline: false },
        ],
        thumbnailUrl: interaction.guild.iconURL({ size: 128 }) || undefined,
        footerText: guild?.footerText || 'Ticket bot',
      });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`close:${ticket.id}`).setLabel('Close').setStyle(ButtonStyle.Danger),
      );

      await interaction.reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral });
    } catch (error) {
      console.error('Error in /new:', error);
      const fallback = buildEmbed({ title: '❌ Error', description: 'Unable to create that ticket.', color: getEmbedColor('error') });
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ embeds: [fallback], flags: MessageFlags.Ephemeral });
      } else {
        await interaction.editReply({ embeds: [fallback] });
      }
    }
  },
};
