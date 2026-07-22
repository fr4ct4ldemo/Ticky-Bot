const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageFlags, PermissionFlagsBits } = require('discord.js');
const prisma = require('../../lib/prisma');
const { buildEmbed, getEmbedColor } = require('../../lib/embeds');
const { t, SUPPORTED_LOCALES, isSupportedLocale } = require('../../lib/i18n');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('language')
    .setDescription('Set the guild language')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('set')
        .setDescription('Set the locale')
        .addStringOption((option) =>
          option
            .setName('locale')
            .setDescription('Locale code')
            .setRequired(true)
            .addChoices(...Object.entries(SUPPORTED_LOCALES).map(([value, name]) => ({ name, value }))),
        ),
    ),
  async execute(interaction) {
    if (!interaction.guildId) {
      const embed = buildEmbed({ title: t('en', 'guild.required.title'), description: t('en', 'guild.required.description'), color: getEmbedColor('error') });
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    // Changing the whole server's language should be a staff-only action,
    // same permission level as other server-config commands.
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      const embed = buildEmbed({ title: '⛔ Forbidden', description: 'You need the Manage Server permission to change the server language.', color: getEmbedColor('error') });
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    try {
      const locale = interaction.options.getString('locale');
      const supportedList = Object.entries(SUPPORTED_LOCALES).map(([code, name]) => `\`${code}\` (${name})`).join(', ');

      if (!isSupportedLocale(locale)) {
        const embed = buildEmbed({
          title: t('en', 'language.invalid.title'),
          description: t('en', 'language.invalid.description', { locale, supported: supportedList }),
          color: getEmbedColor('error'),
        });
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }

      await prisma.guild.upsert({
        where: { guildId: interaction.guildId },
        update: { locale },
        create: { guildId: interaction.guildId, locale },
      });

      const embed = buildEmbed({
        title: t(locale, 'language.updated.title'),
        description: t(locale, 'language.updated.description', { language: SUPPORTED_LOCALES[locale] }),
        color: getEmbedColor('success'),
      });
      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    } catch (error) {
      console.error('Error in /language set:', error);
      const fallback = buildEmbed({ title: '❌ Error', description: 'Unable to update the guild language.', color: getEmbedColor('error') });
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ embeds: [fallback], flags: MessageFlags.Ephemeral });
      } else {
        await interaction.editReply({ embeds: [fallback] });
      }
    }
  },
};
