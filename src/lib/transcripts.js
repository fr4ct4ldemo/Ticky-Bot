const { buildEmbed, getEmbedColor } = require('./embeds');

// @ticketpm/core is published as ESM-only (`"type": "module"`, and its
// `exports` map has no `"require"` condition), while this project is
// CommonJS. A top-level `require('@ticketpm/core')` therefore fails to
// resolve under Node/Jest. We load it lazily via dynamic `import()` instead,
// caching the module namespace promise so repeated calls don't re-import.
// This indirection is exposed as `_loadTicketPmCoreForTests` so tests can
// substitute a mock implementation without needing real ESM interop.
let ticketPmCoreLoader = () => import('@ticketpm/core');
let ticketPmCoreModulePromise = null;
function loadTicketPmCore() {
  if (!ticketPmCoreModulePromise) {
    ticketPmCoreModulePromise = ticketPmCoreLoader();
  }
  return ticketPmCoreModulePromise;
}

let cachedClient = null;

/**
 * Returns a shared TicketPmUploadClient for the process, so repeated
 * transcript uploads reuse the same avatar-hash cache. Returns null if no
 * token is configured, so callers can fall back gracefully instead of
 * throwing.
 */
async function getTicketPmClient() {
  const token = process.env.TICKETPM_TOKEN;
  if (!token) return null;

  if (!cachedClient) {
    const { TicketPmUploadClient } = await loadTicketPmCore();
    cachedClient = new TicketPmUploadClient({
      baseUrl: 'https://api.ticket.pm/v2',
      token,
    });
  }
  return cachedClient;
}

/**
 * Converts our internal message shape (as fetched from Discord) into the
 * `TranscriptBuildInput` shape @ticketpm/core expects: a shared `context`
 * of channels/users, plus a flat `messages` array referencing them by id.
 */
function buildDraftTranscript(messages, { channelId, channelName, ticketId }) {
  const users = {};
  const compactMessages = messages.map((message) => {
    const authorId = message.authorId || 'unknown';
    if (!users[authorId]) {
      users[authorId] = {
        id: authorId,
        username: message.authorName || authorId,
        avatar: message.authorAvatar || undefined,
      };
    }

    return {
      id: message.id || `${ticketId}-${message.createdAt}`,
      timestamp: message.createdAt ? new Date(message.createdAt).toISOString() : new Date().toISOString(),
      author: { id: authorId, username: message.authorName || authorId },
      content: message.content || '',
      attachments: (message.attachments || []).map((attachment, index) => ({
        id: attachment.id || String(index),
        filename: attachment.filename || attachment.name || attachment,
        size: attachment.size || 0,
        url: attachment.url || (typeof attachment === 'string' ? attachment : ''),
      })),
    };
  });

  return {
    context: {
      channel_id: channelId || ticketId,
      channels: {
        [channelId || ticketId]: { name: channelName || `ticket-${ticketId}` },
      },
      users,
    },
    messages: compactMessages,
  };
}

/**
 * Minimal in-memory circuit breaker so a full outage at ticket.pm doesn't
 * add retry latency (and repeated failing calls) to every single ticket
 * close. After `failureThreshold` consecutive failures, the breaker "opens"
 * and uploads are skipped immediately (treated as unavailable) until
 * `cooldownMs` has passed, at which point one call is allowed through as a
 * probe. A single success closes the breaker again.
 *
 * This is process-local (resets on restart) which is fine here — the goal
 * is just to stop hammering a downed API, not to coordinate across shards.
 */
const breaker = {
  consecutiveFailures: 0,
  failureThreshold: 5,
  openedAt: null,
  cooldownMs: 2 * 60 * 1000, // 2 minutes
};

function isBreakerOpen() {
  if (breaker.consecutiveFailures < breaker.failureThreshold) return false;
  if (!breaker.openedAt) return false;

  const elapsed = Date.now() - breaker.openedAt;
  if (elapsed < breaker.cooldownMs) return true;

  // Cooldown elapsed — allow exactly one probe attempt through by resetting
  // the counter to just below threshold. If it fails, recordFailure() below
  // will push it back over threshold and re-open the breaker immediately.
  breaker.consecutiveFailures = breaker.failureThreshold - 1;
  breaker.openedAt = null;
  return false;
}

function recordSuccess() {
  breaker.consecutiveFailures = 0;
  breaker.openedAt = null;
}

function recordFailure() {
  breaker.consecutiveFailures += 1;
  if (breaker.consecutiveFailures >= breaker.failureThreshold && !breaker.openedAt) {
    breaker.openedAt = Date.now();
    console.warn(`ticket.pm circuit breaker opened after ${breaker.consecutiveFailures} consecutive failures; skipping uploads for ${breaker.cooldownMs / 1000}s`);
  }
}

/**
 * Retries a promise-returning function with exponential backoff.
 * @ticketpm/core does not implement its own retries, so we add a thin,
 * bounded retry layer here for transient network/5xx failures only.
 */
async function withRetry(fn, { attempts = 3, baseDelayMs = 300 } = {}) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const status = error?.status || error?.response?.status;
      // Don't retry on clear client errors (bad token, bad payload, etc) —
      // only on network failures or server-side/rate-limit errors.
      const isRetryable = !status || status === 429 || status >= 500;
      if (!isRetryable || attempt === attempts - 1) break;
      const delay = baseDelayMs * 2 ** attempt;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

/**
 * Uploads a ticket's message history to ticket.pm and returns
 * { id, url } for the hosted transcript. Returns null whenever hosting
 * isn't possible for any reason (no token configured, request failed after
 * retries, API down, malformed response, etc) — callers must treat null as
 * "transcript unavailable" and continue closing the ticket normally rather
 * than failing the whole close flow.
 */
async function uploadTranscriptToTicketPm(messages, { channelId, channelName, guildId, ticketId }) {
  const client = await getTicketPmClient();
  if (!client) {
    console.warn('ticket.pm upload skipped: TICKETPM_TOKEN is not configured');
    return null;
  }

  if (isBreakerOpen()) {
    console.warn('ticket.pm upload skipped: circuit breaker is open (recent repeated failures)');
    return null;
  }

  const draftTranscript = buildDraftTranscript(messages, { channelId, channelName, guildId, ticketId });

  try {
    const result = await withRetry(() => client.uploadDraftTranscript(draftTranscript), {
      attempts: 3,
      baseDelayMs: 300,
    });

    if (!result || typeof result.id !== 'string' || !result.id) {
      console.warn('ticket.pm transcript upload returned an unexpected response:', result);
      recordFailure();
      return null;
    }

    recordSuccess();
    // NOTE: the public viewer URL is just the bare id at the site root —
    // NOT under a /t/ path (confirmed against the real ticket.pm dashboard;
    // an earlier /t/{id} guess here was producing 404s).
    return { id: result.id, url: `https://ticket.pm/${result.id}` };
  } catch (error) {
    // Covers: network errors, timeouts, non-2xx after retries, ticket.pm
    // being fully down, auth failures, etc. Every path lands here as a
    // graceful null rather than an unhandled rejection.
    console.warn('ticket.pm transcript upload failed after retries:', error.message);
    recordFailure();
    return null;
  }
}

function buildTranscriptEmbed({ ticketId, url }) {
  return buildEmbed({
    title: url ? '📝 Transcript Ready' : '📝 Transcript Unavailable',
    description: url
      ? `Transcript saved: ${url}`
      : 'This ticket closed normally, but the transcript could not be generated or hosted right now. If you need the message history, contact a staff member.',
    color: getEmbedColor(url ? 'neutral' : 'warning'),
    fields: [{ name: 'Ticket ID', value: ticketId, inline: false }],
  });
}

module.exports = {
  buildDraftTranscript,
  uploadTranscriptToTicketPm,
  buildTranscriptEmbed,
  // Exposed for tests only, so the breaker doesn't leak state between test
  // cases/files sharing the same process.
  _resetCircuitBreakerForTests: () => {
    breaker.consecutiveFailures = 0;
    breaker.openedAt = null;
  },
  // Exposed for tests only: lets a test substitute a fake @ticketpm/core
  // module (avoiding real ESM interop / jest.doMock on a native `import()`)
  // and clears the cached client/module promise so the next
  // getTicketPmClient() call picks up the swapped loader.
  _setTicketPmCoreLoaderForTests: (loader) => {
    ticketPmCoreLoader = loader;
    ticketPmCoreModulePromise = null;
    cachedClient = null;
  },
};
