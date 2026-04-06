# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Telegram bot for generating product cards (infographics) for marketplaces. Users send an image + text in a single message, the bot generates a styled product card using an AI image generation service.

**Status:** Stage 2 — database, real balance, admin panel, YooMoney payments, webhook server.

**Language:** Russian (all UI text, prompts, and user-facing content are in Russian). All console output and code comments must be in English.

## Tech Stack

- **Node.js + TypeScript** (ES2022, ESNext modules, `"type": "module"`)
- **grammY** — Telegram Bot framework
- **OpenAI SDK** — used as HTTP client for OpenRouter API (OpenAI-compatible)
- **better-sqlite3** — SQLite database (synchronous, no ORM)
- **dotenv** — configuration via `.env`

## Development Commands

- `npm run dev` — start with hot-reload (`tsx watch`)
- `npm run start` — start without watch

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `BOT_TOKEN` | yes | Telegram Bot API token |
| `OPENROUTER_API_KEY` | yes | OpenRouter API key |
| `ADMIN_IDS` | no | Comma-separated Telegram user IDs for admin panel access |
| `YOOMONEY_WALLET_ID` | no | YooMoney wallet number (for payments) |
| `YOOMONEY_NOTIFICATION_SECRET` | no | YooMoney notification secret |
| `PAYMENT_RETURN_URL` | no | URL to return after payment (e.g. `https://t.me/botname`) |
| `WEBHOOK_PORT` | no | Port for webhook server (default: 3000) |
| `WEBHOOK_BASE_URL` | no | Public URL for webhooks (e.g. `https://your-server.com`) |

## Project Structure

```
src/
├── bot.ts                  # Entry point — bot setup, middleware, handlers, webhook
├── config.ts               # Env parsing and validation
├── context.ts              # BotContext type (extends grammY Context with dbUser)
├── webhook.ts              # HTTP server for YooMoney payment webhooks
├── db/
│   ├── index.ts            # Database initialization, schema, WAL mode
│   ├── users.ts            # User CRUD, balance operations, listing
│   ├── generations.ts      # Generation records, stats, recent list
│   ├── payments.ts         # Payment records, stats
│   └── settings.ts         # Key-value settings (price, welcome balance, etc.)
├── handlers/
│   ├── start.ts            # /start command, welcome message
│   ├── menu.ts             # Main menu, help, balance screens (real balance)
│   ├── generate.ts         # Photo+text → balance check → AI generation → DB record
│   ├── admin.ts            # /admin command — admin panel (users, stats, settings)
│   └── payment.ts          # Payment flow — amount selection, YooMoney link
├── keyboards/
│   └── index.ts            # Inline keyboard builders (menu, payment, admin)
├── middleware/
│   ├── auth.ts             # Register/update user in DB on every request
│   ├── block.ts            # Block check — blocked users get rejected
│   ├── consent.ts          # Optional PD consent gate (configurable via settings)
│   ├── rateLimit.ts        # Rate limiting (5 generations/min per user)
├── payments/
│   └── yoomoney.ts         # YooMoney quickpay URL builder + notification verification
├── providers/
│   ├── types.ts            # CardProvider interface, format types
│   └── openrouter.ts       # OpenRouter provider (Gemini via OpenAI-compatible API)
└── texts/
    └── index.ts            # All user-facing text constants
```

## Database

- **SQLite** via `better-sqlite3` — file at `./data/bot.db`
- **Tables:** `users`, `generations`, `payments`, `settings`
- Money stored in **kopecks** (1 RUB = 100 kopecks) as integers
- No race conditions: synchronous API + single-threaded Node.js
- WAL mode enabled for better read concurrency

## Key Business Logic

- **Core flow:** User sends photo + text → selects format → balance check → AI generates card → balance deducted → result saved in DB
- **Balance:** Real balance in kopecks, checked before generation, refunded on AI failure
- **Rate limiting:** 5 generations per minute per user (in-memory)
- **Admin panel:** `/admin` command for users in `ADMIN_IDS` — manage users, balance, stats, settings, broadcast
- **Payments:** YooMoney quickpay integration via webhook server on separate HTTP port
- **Pending requests:** In-memory Map with 30-min TTL and 10-min cleanup
- **Graceful shutdown:** Closes DB and stops bot on SIGINT/SIGTERM

## Middleware Order (in bot.ts)

1. `auth` — register/update user in DB, set `ctx.dbUser`
2. `block` — reject blocked users
3. `consent` — optional PD consent check (configurable)

## Admin Panel

Entry: `/admin` command. Access: `ADMIN_IDS` env variable.
Features: user list with pagination, user detail (balance +/-, block), statistics, recent generations, recent payments, settings (generation price, welcome balance), broadcast to all users.

## Supported Image Formats

- 1:1 — Яндекс Маркет
- 3:4 — Wildberries, Ozon
- 4:3 — Авито
- 9:16 — Stories / Reels

## AI Integration

- **OpenRouter** — single active provider, model `google/gemini-3.1-flash-image-preview`
- Uses OpenAI SDK with `baseURL: "https://openrouter.ai/api/v1"`
- Native aspect ratio support via `image_config.aspect_ratio` — no crop/resize needed
- **Provider:** Single `OpenRouterProvider` instance, instantiated directly in generate handler

## Backlog (deferred features)

- Multi-card generation (up to 10 cards/variants per request)
- Reference-based generation (style transfer from example images)
- Object merging (combine multiple images into one card)
- Image editing (re-send generated card with edit instructions)

## Documentation

- `docs/requirements.md` — Full functional requirements with prototype references
- `docs/dialogs.md` — Client communication history and project context
- `docs/prototipe/` — UI prototype screenshots (PNG)
