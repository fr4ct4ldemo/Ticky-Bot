const Redis = require('ioredis');

let client;

function getRedisClient() {
  if (!client) {
    if (!process.env.REDIS_URL) {
      throw new Error('REDIS_URL is not configured');
    }

    client = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
    });
  }

  return client;
}

module.exports = { getRedisClient };
