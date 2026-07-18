# Ticky — Discord Ticket Bot

![Node](https://img.shields.io/badge/node-20%2B-339933?logo=node.js&logoColor=white)
![discord.js](https://img.shields.io/badge/discord.js-v14-5865F2?logo=discord&logoColor=white)
![Prisma](https://img.shields.io/badge/database-SQLite-2D3748?logo=prisma&logoColor=white)
![Tests](https://img.shields.io/badge/tests-jest-C21325?logo=jest&logoColor=white)

**Ticky** is a multi-guild Discord support-ticket bot. Server admins publish a panel users can click or select from to open a ticket, then manage the resulting tickets — claim, transfer, prioritize, close — all through slash commands and clean embeds.

Built with **Node.js 20**, **discord.js v14**, **Prisma** (SQLite), and **Redis**.

---

## Features

- **Ticket panels** — post a panel in any channel with a dropdown, buttons, or both, so users can open a ticket in one click. Optionally route tickets from a panel into a specific Discord category channel.
- **Categories** — a fixed set of ticket categories (General Support, Giveaway Support, Custom Order, Other), auto-created per server the first time a panel is created — no separate setup step.
- **Ticket lifecycle** — open (`/new` or via panel), claim, transfer, set priority, and close, restricted to one open ticket per user per server.
- **Inactivity auto-close** — a ticket with no new messages for 2 hours is closed automatically (with a "closing soon" warning posted 15 minutes ahead of time). Any message in the channel resets the timer.
- **Staged ticket closing** — closing a ticket (via `/close`, the Close button, or auto-close) immediately blocks the opener from sending further messages, then fully revokes their access to the channel and deletes it a few seconds later — giving everyone a moment to see the closing notice and transcript link before the channel disappears.
- **Built-in help menu** — `/help` gives an interactive menu covering commands, FAQ, and setup steps.
- **Per-guild config** — language/locale and embed theme color, scoped per server.
- **Admin tools** — owner-only broadcast and guild-inspection commands.
- **Guild-scoped data** — every database record is tied to a `guildId`, so servers never see each other's tickets or config.

---

## Requirements

- [Node.js 20+](https://nodejs.org/)
- [Docker](https://www.docker.com/) (for Redis via Docker Compose)
- A Discord application + bot token — [Discord Developer Portal](https://discord.com/developers/applications)

Ticky uses **SQLite** for storage (via Prisma) — the database is just a local file, so no separate database server is required.

---

## Quick start

```bash
git clone <this-repo>
cd ticky
npm install
cp .env.example .env       # then fill in .env — see "Environment variables" below
docker compose up -d       # starts Redis
npx prisma generate
npx prisma migrate dev --name init
npm run deploy:commands    # registers slash commands with Discord
npm run dev                # starts the bot
```

If everything is configured correctly, you'll see `Ready as Ticky#<discriminator>` in the console, and the bot will show as **online** in your Discord server. If you don't see that, check [Troubleshooting](#troubleshooting) below before doing anything else.

---

## Full setup (step by step)

### 1. Create a Discord application and bot

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications) and click **New Application**.
2. Open the **Bot** tab → **Reset Token** (or **Add Bot** if this is a new app) → copy the token. This is your `DISCORD_TOKEN` — treat it like a password.
3. On the same **Bot** tab, enable **Server Members Intent** (Ticky needs it to look up who has which staff role). No other privileged intents are required.
4. Go to the **OAuth2 → General** tab and copy the **Client ID**. This is your `CLIENT_ID`.
5. Go to **OAuth2 → URL Generator**, check the `bot` and `applications.commands` scopes, then under **Bot Permissions** check at minimum: `Manage Channels`, `Send Messages`, `Embed Links`, `Attach Files`, `Read Message History`, `Manage Threads` (if you plan to use thread-based tickets). Copy the generated URL.
6. Open that URL in your browser and invite the bot to your test server.

### 2. Clone and install

```bash
git clone <this-repo>
cd ticky
npm install
```

### 3. Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in the values — see the [Environment variables](#environment-variables) table below for what each one does. At minimum you need `DISCORD_TOKEN`, `CLIENT_ID`, `BOT_OWNER_ID` (your own Discord user ID — enable Developer Mode in Discord, then right-click your name → **Copy User ID**), and `DATABASE_URL`.

While you're testing, also set `GUILD_ID` to your test server's ID — this makes slash commands register instantly to that one server instead of waiting up to an hour for Discord's global command cache.

### 4. Start Redis

```bash
docker compose up -d
```

Redis is optional — the bot will start and run without it, just without caching. Skip this step if you don't have Docker installed and don't need caching yet.

### 5. Set up the database

```bash
npx prisma generate
npx prisma migrate dev --name init
```

The first command generates the Prisma client from `prisma/schema.prisma`. The second creates `prisma/dev.db` (a local SQLite file) and applies all migrations. Re-run `npx prisma generate` any time you `npm install` fresh or pull schema changes.

### 6. Register slash commands

```bash
npm run deploy:commands
```

This pushes the bot's slash commands to Discord. **Nothing will show up in Discord until you run this once.** Re-run it any time a command is added, removed, or has its options changed.

### 7. Start the bot

```bash
npm run dev
```

Watch the console for `Ready as Ticky#<discriminator>`. Once you see that, the bot is online — go to your test server and try `/help`.

> To keep the bot running in the background (e.g. on a VPS) instead of in a terminal you have to leave open, use a process manager like [pm2](https://pm2.keymetrics.io/) (`pm2 start src/index.js --name ticky`) or run it inside the Docker setup of your choice.

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `DISCORD_TOKEN` | ✅ | Your bot's token from the Developer Portal |
| `CLIENT_ID` | ✅ | Your Discord application's client ID |
| `GUILD_ID` | Optional | Restricts slash-command registration to one server (faster for development) |
| `BOT_OWNER_ID` | ✅ | Discord user ID allowed to run owner-only commands (`/broadcast`, `/guild-info`) |
| `DATABASE_URL` | ✅ | SQLite file path, e.g. `file:./dev.db` |
| `REDIS_URL` | Optional | Redis connection string; bot runs without caching if unset |
| `TICKETPM_TOKEN` | Optional | Enables hosted transcript uploads via [ticket.pm](https://ticket.pm); transcripts are skipped gracefully if unset |
| `S3_*` | Optional | Reserved for future attachment/transcript storage |
| `SENTRY_DSN` | Optional | Error reporting |
| `LOG_LEVEL` | Optional | `pino` log level (default `info`) |

---

## First-time server setup (as a Discord admin)

Once Ticky is in your server (see [Full setup](#full-setup-step-by-step) above if it isn't yet), run this in your server:

1. `/ticket-panel create` — posts a panel so users can open tickets. Ticket categories are created automatically the first time you run this (no separate category-setup step needed). Options:
   - `style` — Dropdown menu / Buttons / Both (defaults to buttons)
   - `channel` — where to post the panel (defaults to the current channel)
   - `category` — a Discord category channel that tickets from this panel should be created under (defaults to whichever category the panel's own channel is in)
   - `staff_role` — a Discord role that can claim, close, transfer, and set the priority of tickets created from this panel. If you skip this, only server Administrators can manage those tickets.
2. *(Optional)* `/theme set color:<value>` — set the server's embed color.
3. *(Optional)* `/language set locale:<code>` — set the server's locale.

Run `/help` at any time for an interactive walkthrough of all of the above.

---

## Command reference

| Command | Description |
|---|---|
| `/help [command]` | Interactive help menu, or details on a specific command |
| `/new category:<name> subject:<text>` | Open a new ticket directly |
| `/close [reason]` | Close your own open ticket |
| `/claim` | Claim the current ticket |
| `/transfer user:<member>` | Transfer a ticket to another staff member |
| `/priority set value:<Low\|Medium\|High\|Urgent>` | Set ticket priority (staff for that ticket's category, or Administrator) |
| `/ticket-panel create [style] [channel] [category] [staff_role]` | Create a ticket panel; categories are auto-created (admin) |
| `/ticket-panel list` | List ticket panels, including which Discord category each routes tickets into (admin) |
| `/ticket-panel delete name:<name>` | Delete a ticket panel (admin) |
| `/theme set color:<value>` | Set the server's embed theme color |
| `/language set locale:<code>` | Set the server's locale |
| `/broadcast message:<text>` | Send an announcement (bot owner only) |
| `/guild-info guild-id:<id>` | Inspect a guild's stored configuration (bot owner only) |

---

## Project structure

```
src/
  commands/       # slash commands, grouped by area (ticket/, admin/, config/)
  components/     # button and select-menu interaction handlers
  events/         # discord.js client event handlers (ready, interactionCreate, messageCreate)
  jobs/           # periodic background jobs (inactivity auto-close scan)
  lib/            # shared helpers: embeds, i18n, permissions, prisma, redis, tickets, inactivity
  locales/        # translation bundles
  deploy-commands.js  # registers slash commands with Discord
  index.js        # bot entry point
prisma/           # database schema and migrations
tests/            # test suite
```

---

## Testing

```bash
npm test
```

Runs the Jest suite (`--runInBand`). Covers embed building and transcript upload behavior, including the circuit breaker that protects against a downed ticket.pm API.

---

## Troubleshooting

- **Bot doesn't respond to slash commands** — run `npm run deploy:commands` again; commands only register with Discord after this script runs, and any option changes need a re-run. If you just registered them and they're not showing up, global commands can take up to an hour to propagate — set `GUILD_ID` in `.env` for instant updates during development.
- **Bot shows offline / process exits immediately** — check the console output for the actual error; the most common cause is a missing or invalid `DISCORD_TOKEN` in `.env`.
- **`Cannot find module '@prisma/client'` or similar** — run `npx prisma generate` after every `npm install`.
- **`/claim`, `/close`, `/transfer`, or `/priority` say "Only staff can..." for someone who should have access** — that person needs either server Administrator, or the Discord role set as `staff_role` when the panel was created. Re-run `/ticket-panel create` with `staff_role` set to update it (or check with a server admin which role was assigned).
- **Prisma install-script warnings** — if npm warns that `@prisma/client`, `@prisma/engines`, or `prisma` have pending install scripts, run `npm approve-scripts <package>` (or `npm approve-scripts --allow-scripts-pending` to review all of them at once) so Prisma's native engine binaries can download.
- **Redis connection errors on startup** — Redis is optional; if it's unavailable the bot logs a warning and continues without it. Confirm `docker compose up -d` is running if you want caching enabled.
- **Transcripts aren't uploading** — this requires `TICKETPM_TOKEN` to be set; without it, ticket closes still work, they just skip the hosted transcript step.
- **A ticket closed on its own with no one clicking Close** — this is the inactivity auto-close feature: a ticket with no new messages for 2 hours closes automatically (a "closing soon" notice is posted 15 minutes before that happens). Any message posted in the channel resets the countdown.

---

## Notes

- Ticky's display name and avatar are set in the Discord Developer Portal (**Bot** tab), not in this codebase — embeds read `client.user.username` dynamically, so they always match whatever is set there.
- Placeholder implementations are included for a few lifecycle and admin commands so the project can be extended rapidly.
- Redis is optional at startup — if it's unavailable, the bot logs a warning and continues without it.

## Security

- **Never commit `.env`.** It holds your live bot token and other secrets. This repo's `.gitignore` excludes it — use `.env.example` as a template instead.
- If a real token is ever accidentally committed or exposed, treat it as compromised: regenerate it immediately in the Discord Developer Portal (and any other affected service), even after removing it from the repo. Deleting a file in a later commit does not remove it from git history.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for local setup, coding conventions, and how to submit changes.
