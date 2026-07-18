require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const pino = require('pino');
const prisma = require('./lib/prisma');
const { getRedisClient } = require('./lib/redis');
const { runInactivityCheck } = require('./jobs/inactivity');

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages] });

// How often to scan open tickets for inactivity (auto-close after 2 hours
// of silence — see src/lib/inactivity.js for the actual timeout).
const INACTIVITY_CHECK_INTERVAL_MS = 60 * 1000;
client.commands = new Collection();

function loadCommands(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      loadCommands(fullPath);
      continue;
    }

    if (!entry.name.endsWith('.js')) continue;

    const command = require(fullPath);

    if (!command?.data || typeof command.execute !== 'function') {
      logger.warn({ file: fullPath }, 'Skipping command file: missing "data" or "execute" export');
      continue;
    }

    client.commands.set(command.data.name, command);
  }
}

const eventFiles = ['ready', 'interactionCreate', 'messageCreate'];

(async () => {
  loadCommands(path.join(__dirname, 'commands'));
  logger.info({ commands: [...client.commands.keys()] }, `Loaded ${client.commands.size} command(s)`);

  for (const file of eventFiles) {
    const event = require(`./events/${file}`);
    if (event.once) {
      client.once(event.name, (...args) => event.execute(...args, client));
    } else {
      client.on(event.name, (...args) => event.execute(...args, client));
    }
  }

  try {
    await prisma.$connect();
    logger.info('Database connected');

    try {
      await getRedisClient().ping();
      logger.info('Redis connected');
    } catch (redisError) {
      logger.warn({ err: redisError }, 'Redis unavailable; continuing without it');
    }

    await client.login(process.env.DISCORD_TOKEN);

    setInterval(() => {
      runInactivityCheck(client)
        .then(({ warned, closed }) => {
          if (warned || closed) {
            logger.info({ warned, closed }, 'Inactivity check completed');
          }
        })
        .catch((err) => logger.error({ err }, 'Inactivity check failed'));
    }, INACTIVITY_CHECK_INTERVAL_MS);
  } catch (error) {
    logger.error({ err: error }, 'Failed to bootstrap bot');
    process.exit(1);
  }
})();

process.on('SIGINT', async () => {
  logger.info('Shutting down');
  await prisma.$disconnect();
  process.exit(0);
});
