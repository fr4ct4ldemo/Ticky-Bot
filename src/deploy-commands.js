require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord.js');

function loadCommandFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const commands = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      commands.push(...loadCommandFiles(fullPath));
      continue;
    }

    if (!entry.name.endsWith('.js')) continue;

    const command = require(fullPath);

    if (!command?.data || typeof command.execute !== 'function') {
      console.warn(`Skipping ${fullPath}: missing "data" or "execute" export.`);
      continue;
    }

    commands.push(command.data.toJSON());
  }

  return commands;
}

const commandsDir = path.join(__dirname, 'commands');
const commands = loadCommandFiles(commandsDir);

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

async function main() {
  try {
    console.log(`Registering ${commands.length} global slash command(s): ${commands.map((c) => c.name).join(', ')}`);
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
    console.log('Registered global slash commands.');
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

main();
