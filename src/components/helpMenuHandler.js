async function handleHelpMenuSelect(interaction, client) {
  const helpCommand = client.commands.get('help');
  const choice = interaction.values[0];

  if (choice === 'faq') {
    const embed = helpCommand.buildFaqListEmbed(client);
    const row = helpCommand.buildFaqSelectRow();
    return interaction.update({ embeds: [embed], components: [row] });
  }

  const embedBuilders = {
    commands: helpCommand.buildCommandsEmbed,
    setup: helpCommand.buildSetupEmbed,
  };

  const buildEmbedFn = embedBuilders[choice] || helpCommand.buildHelpHomeEmbed;
  const embed = buildEmbedFn(client);
  const selectRow = helpCommand.buildHelpMenuSelectRow();

  await interaction.update({ embeds: [embed], components: [selectRow] });
}

async function handleFaqSelect(interaction, client) {
  const helpCommand = client.commands.get('help');

  if (interaction.values[0] === 'back') {
    const embed = helpCommand.buildHelpHomeEmbed(client);
    const selectRow = helpCommand.buildHelpMenuSelectRow();
    return interaction.update({ embeds: [embed], components: [selectRow] });
  }

  const index = Number(interaction.values[0]);
  const embed = helpCommand.buildFaqAnswerEmbed(client, index);
  const row = helpCommand.buildFaqSelectRow();

  await interaction.update({ embeds: [embed], components: [row] });
}

module.exports = { handleHelpMenuSelect, handleFaqSelect };
