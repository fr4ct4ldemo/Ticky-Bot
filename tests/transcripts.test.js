const {
  buildDraftTranscript,
  uploadTranscriptToTicketPm,
  buildTranscriptEmbed,
  _resetCircuitBreakerForTests,
  _setTicketPmCoreLoaderForTests,
} = require('../src/lib/transcripts');

describe('transcript building', () => {
  test('builds a ticket.pm-compatible draft transcript with context and messages', () => {
    const draft = buildDraftTranscript(
      [
        {
          id: 'msg-1',
          authorId: 'user-1',
          authorName: 'Alice',
          createdAt: '2026-07-13T12:00:00.000Z',
          content: 'Hello there',
          attachments: [{ id: 'a1', filename: 'image.png', size: 123, url: 'https://cdn.discordapp.com/a1.png' }],
        },
      ],
      { channelId: 'chan-1', channelName: 'general-support-alice', guildId: 'guild-1', ticketId: 'ticket-1' }
    );

    expect(draft.context.channel_id).toBe('chan-1');
    expect(draft.context.channels['chan-1'].name).toBe('general-support-alice');
    expect(draft.context.users['user-1'].username).toBe('Alice');
    expect(draft.messages).toHaveLength(1);
    expect(draft.messages[0]).toMatchObject({
      id: 'msg-1',
      content: 'Hello there',
      author: { id: 'user-1', username: 'Alice' },
    });
    expect(draft.messages[0].attachments[0]).toMatchObject({ filename: 'image.png', size: 123 });
  });

  test('falls back to the ticket id as channel id/name when none is given', () => {
    const draft = buildDraftTranscript([], { ticketId: 'ticket-2' });
    expect(draft.context.channel_id).toBe('ticket-2');
    expect(draft.context.channels['ticket-2'].name).toBe('ticket-ticket-2');
  });
});

describe('transcript upload fallback', () => {
  const originalToken = process.env.TICKETPM_TOKEN;

  beforeEach(() => {
    _resetCircuitBreakerForTests();
  });

  afterEach(() => {
    process.env.TICKETPM_TOKEN = originalToken;
    jest.restoreAllMocks();
    _resetCircuitBreakerForTests();
  });

  test('returns null (not a thrown error) when no token is configured', async () => {
    delete process.env.TICKETPM_TOKEN;
    const result = await uploadTranscriptToTicketPm([], { ticketId: 'ticket-3' });
    expect(result).toBeNull();
  });

  test('buildTranscriptEmbed renders a graceful "unavailable" embed when url is null', () => {
    const embed = buildTranscriptEmbed({ ticketId: 'ticket-4', url: null });
    const json = embed.toJSON();
    expect(json.title).toMatch(/unavailable/i);
    expect(json.description).toMatch(/could not be generated|contact a staff member/i);
  });

  test('buildTranscriptEmbed renders the link when url is present', () => {
    const embed = buildTranscriptEmbed({ ticketId: 'ticket-5', url: 'https://ticket.pm/t/abc123' });
    const json = embed.toJSON();
    expect(json.title).toMatch(/ready/i);
    expect(json.description).toContain('https://ticket.pm/t/abc123');
  });
});

describe('transcript upload circuit breaker', () => {
  const originalToken = process.env.TICKETPM_TOKEN;

  beforeEach(() => {
    process.env.TICKETPM_TOKEN = 'test-token';
    _resetCircuitBreakerForTests();
  });

  afterEach(() => {
    process.env.TICKETPM_TOKEN = originalToken;
    jest.restoreAllMocks();
    jest.resetModules();
    _resetCircuitBreakerForTests();
  });

  test('opens after repeated consecutive failures and skips the API call entirely', async () => {
    // @ticketpm/core is ESM-only and loaded internally via dynamic import(),
    // which jest.doMock cannot intercept under default (non-ESM) Jest config.
    // Instead we substitute the loader directly via the test-only hook.
    const mockUploadDraftTranscript = jest.fn().mockRejectedValue(
      Object.assign(new Error('network down'), { status: 503 })
    );
    const MockTicketPmUploadClient = jest.fn().mockImplementation(() => ({
      uploadDraftTranscript: mockUploadDraftTranscript,
    }));

    _setTicketPmCoreLoaderForTests(async () => ({
      TicketPmUploadClient: MockTicketPmUploadClient,
    }));
    _resetCircuitBreakerForTests();

    // 5 consecutive failures should trip the breaker (failureThreshold = 5).
    for (let i = 0; i < 5; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const result = await uploadTranscriptToTicketPm([], { ticketId: `ticket-fail-${i}` });
      expect(result).toBeNull();
    }

    const callsBeforeBreakerOpen = mockUploadDraftTranscript.mock.calls.length;

    // One more call: the breaker should now be open, so the underlying
    // client must NOT be invoked again (no extra retries/latency).
    const resultAfterOpen = await uploadTranscriptToTicketPm([], { ticketId: 'ticket-should-be-skipped' });
    expect(resultAfterOpen).toBeNull();

    const callsAfterBreakerOpen = mockUploadDraftTranscript.mock.calls.length;
    expect(callsAfterBreakerOpen).toBe(callsBeforeBreakerOpen);

    // Restore the real loader so later tests/files (or an afterAll import()
    // of the actual package in this same suite) don't stay mocked.
    _setTicketPmCoreLoaderForTests(() => import('@ticketpm/core'));
  });
});
