const { Events, MessageFlags } = require('discord.js');
const { buildEmbed, getEmbedColor } = require('../lib/embeds');
const { handleTicketPanelSelect } = require('../components/selectMenuHandler');
const { handleHelpMenuSelect, handleFaqSelect } = require('../components/helpMenuHandler');
const { handleButton } = require('../components/buttonHandler');

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction, client) {
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) {
        const embed = buildEmbed({ title: '⚠️ Unknown Command', description: 'That slash command is not registered by this scaffold.', color: getEmbedColor('warning') });
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }

      try {
        return await command.execute(interaction, client);
      } catch (error) {
        console.error(`Error executing command "${interaction.commandName}":`, error);
        const fallback = buildEmbed({ title: '❌ Error', description: 'An unexpected error occurred while processing that request.', color: getEmbedColor('error') });
        if (!interaction.replied && !interaction.deferred) {
          return interaction.reply({ embeds: [fallback], flags: MessageFlags.Ephemeral });
        }
        return interaction.editReply({ embeds: [fallback] });
      }
    }

    if (interaction.isStringSelectMenu()) {
      try {
        if (interaction.customId === 'ticket-panel-select') {
          return await handleTicketPanelSelect(interaction);
        }
        if (interaction.customId === 'help-menu-select') {
          return await handleHelpMenuSelect(interaction, client);
        }
        if (interaction.customId === 'help-faq-select') {
          return await handleFaqSelect(interaction, client);
        }
      } catch (error) {
        console.error(`Error handling select menu "${interaction.customId}":`, error);
        const fallback = buildEmbed({ title: '❌ Error', description: 'An unexpected error occurred while processing that selection.', color: getEmbedColor('error') });
        if (!interaction.replied && !interaction.deferred) {
          return interaction.reply({ embeds: [fallback], flags: MessageFlags.Ephemeral });
        }
        return interaction.editReply({ embeds: [fallback] });
      }
    }

    if (interaction.isButton()) {
      try {
        return await handleButton(interaction);
      } catch (error) {
        console.error(`Error handling button "${interaction.customId}":`, error);
        const fallback = buildEmbed({ title: '❌ Error', description: 'An unexpected error occurred while processing that button.', color: getEmbedColor('error') });
        if (!interaction.replied && !interaction.deferred) {
          return interaction.reply({ embeds: [fallback], flags: MessageFlags.Ephemeral });
        }
        return interaction.editReply({ embeds: [fallback] });
      }
    }
  },
};
