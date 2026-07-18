# Contributing to Ticky

Thanks for taking a look at Ticky. This doc covers local setup for development and a few conventions the codebase follows.

## Local setup

Follow the [Setup section in the README](./README.md#setup) to get the bot running locally. In short:

```bash
npm install
cp .env.example .env   # fill in your own values
docker compose up -d   # starts Redis
npx prisma generate
npx prisma migrate dev --name init
npm run deploy:commands
npm run dev
```

Use your own Discord application for development — create one in the [Discord Developer Portal](https://discord.com/developers/applications) and invite it to a private test server. Setting `GUILD_ID` in `.env` scopes slash-command registration to that one server, so changes show up instantly instead of waiting on Discord's global command cache.

## Project structure

```
src/
  commands/       # slash commands, grouped by area (ticket/, admin/, config/)
  components/     # button and select-menu interaction handlers
  events/         # discord.js client event handlers (ready, interactionCreate)
  lib/            # shared helpers: embeds, i18n, permissions, prisma, redis
  locales/        # translation bundles
  deploy-commands.js
  index.js
prisma/           # schema.prisma and migrations
tests/
```

New slash commands go under `src/commands/<area>/`, and any new command needs `npm run deploy:commands` re-run before Discord will recognize it.

## Database changes

The schema lives in `prisma/schema.prisma` (SQLite). After editing it:

```bash
npx prisma migrate dev --name <short-description>
```

This generates a new migration under `prisma/migrations/` and regenerates the Prisma client. Commit the generated migration folder along with your schema change — don't hand-edit generated SQL.

## Tests

```bash
npm test
```

Runs the Jest suite (`--runInBand`, since some tests share process-level state like the transcript-upload circuit breaker). Please add or update tests for any behavior change, especially around:

- Ticket lifecycle logic (`src/lib/tickets.js`)
- Transcript upload fallback / retry / circuit-breaker behavior (`src/lib/transcripts.js`)
- Embed formatting (`src/lib/embeds.js`)

If you're adding a dependency that ships ESM-only (no CommonJS `exports` condition), see how `src/lib/transcripts.js` loads `@ticketpm/core` via a cached dynamic `import()` — this project is CommonJS throughout, so ESM-only packages need that pattern rather than a top-level `require`.

## Code style

- CommonJS (`require`/`module.exports`) throughout — see the ESM-interop note above for the one exception.
- Keep Discord-facing strings (embed text, error messages) short and consistent with the existing tone.
- Prefer small, focused functions in `src/lib/` over inlining logic in command handlers, so behavior can be unit tested without spinning up a Discord client.

## Before opening a pull request

- [ ] `npm test` passes
- [ ] `npm run build` passes (syntax check on entry points)
- [ ] New/changed commands are documented in the README's command reference table
- [ ] No secrets, tokens, or `.env` values included in the diff

## Security

If you find a security issue (e.g. a way to bypass guild-scoping, or leak another server's ticket data), please don't open a public issue. Reach out to the maintainer directly instead.
