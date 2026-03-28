# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Telegram bot for generating product cards (infographics) for marketplaces. Users send an image + text in a single message, the bot generates a styled product card using an AI image generation service.

**Status:** Test version — core generation flow works, advanced features planned.

**Language:** Russian (all UI text, prompts, and user-facing content are in Russian)

## Tech Stack

- **Node.js + TypeScript** (ES2022, ESNext modules, `"type": "module"`)
- **grammY** — Telegram Bot framework
- **OpenAI SDK** — used as HTTP client for OpenRouter API (OpenAI-compatible)
- **dotenv** — configuration via `.env`

## Development Commands

- `npm run dev` — start with hot-reload (`tsx watch`)
- `npm run start` — start without watch

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `BOT_TOKEN` | yes | Telegram Bot API token |
| `OPENROUTER_API_KEY` | yes | OpenRouter API key |
| `ALLOWED_USER_IDS` | yes | Comma-separated Telegram user IDs for whitelist |

## Project Structure

```
src/
├── bot.ts                  # Entry point — bot setup and launch
├── config.ts               # Env parsing and validation
├── handlers/
│   ├── start.ts            # /start command, welcome message
│   ├── menu.ts             # Main menu, help, balance screens
│   ├── generate.ts         # Photo+text → format selection → AI generation
│   └── provider.ts         # /provider command — switch AI provider
├── keyboards/
│   └── index.ts            # Inline keyboard builders
├── middleware/
│   └── whitelist.ts        # Access control by Telegram user ID
├── providers/
│   ├── types.ts            # CardProvider interface, format types
│   ├── registry.ts         # Provider registry (register, switch, get)
│   └── openrouter.ts       # OpenRouter provider (Gemini via OpenAI-compatible API)
└── texts/
    └── index.ts            # All user-facing text constants
```

## Key Business Logic (current implementation)

- **Core flow:** User sends photo + text caption → selects format (1:1, 3:4, 4:3, 9:16) → AI generates product card
- **Whitelist:** Access restricted to Telegram IDs listed in `ALLOWED_USER_IDS`
- **Balance:** Stub only (shows placeholder, no real billing)
- **Text in quotes** ("like this") means the bot should use that text verbatim on the card

## Supported Image Formats

- 1:1 — Яндекс Маркет
- 3:4 — Wildberries, Ozon
- 4:3 — Авито
- 9:16 — Stories / Reels

## AI Integration

- **OpenRouter** — single active provider, model `google/gemini-3.1-flash-image-preview`
- Uses OpenAI SDK with `baseURL: "https://openrouter.ai/api/v1"`
- Native aspect ratio support (1:1, 3:4, 4:3, 9:16) — no crop/resize needed
- **Provider architecture:** `CardProvider` interface → provider registry → `/provider` command to switch at runtime

## UI Architecture (current implementation)

- All navigation uses Telegram Inline Keyboard buttons
- Screen transitions via callback buttons that **edit the current message** (not send new ones)
- `/start` → main menu (3 buttons: "Как генерировать", "Баланс", "Информация")
- Help section — 7 topic screens (recommendations, image format, text, editing, multiple cards, reference, merge objects)
- Info section — 3 screens (capabilities, terms, support)
- Balance — stub screen + tariffs
- Format selection — 4 buttons (1:1, 3:4, 4:3, 9:16)
- Every screen has a "Back" button

## Planned Features

- **Multi-card generation:** Up to 10 cards/variants per request (auto or manual mode)
- **Reference-based generation:** Multiple images as a group — user specifies product vs style reference
- **Object merging:** Multiple images combined into one card
- **Image editing:** Re-send a generated card with edit instructions
- **Payment system:** User balance in RUB, 50 RUB per generation, YooKassa integration

## Documentation

- `docs/requirements.md` — Full functional requirements with prototype references
- `docs/dialogs.md` — Client communication history and project context
- `docs/prototipe/` — UI prototype screenshots (PNG)
