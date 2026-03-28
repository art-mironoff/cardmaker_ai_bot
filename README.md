# CardMaker AI Bot

Telegram-бот для генерации карточек товаров (инфографики) для маркетплейсов. Пользователь отправляет изображение + текст одним сообщением, бот генерирует стилизованную карточку товара с помощью AI.

## Возможности

- Генерация карточки товара из изображения и текстового описания
- Поддержка форматов: 1:1, 3:4, 4:3, 9:16
- Текст в кавычках используется на карточке без изменений
- Inline-меню с разделами помощи, информации и баланса
- Whitelist доступа по Telegram ID или username
- Переключение AI-провайдера через `/provider`

## Форматы карточек

| Формат | Назначение |
|--------|-----------|
| 1:1 | Яндекс Маркет |
| 3:4 | Wildberries, Ozon |
| 4:3 | Авито |
| 9:16 | Stories / Reels |

## Стек

- **Node.js + TypeScript** (ES2022, ESNext modules)
- **grammY** — Telegram Bot framework
- **OpenAI SDK** — HTTP-клиент для OpenRouter API
- **dotenv** — конфигурация через `.env`

## Установка

```bash
git clone <repo-url>
cd cardmaker_ai_bot
npm install
```

## Настройка

Создайте файл `.env`:

```env
BOT_TOKEN=your_telegram_bot_token
OPENROUTER_API_KEY=your_openrouter_api_key
ALLOWED_USER_IDS=123456,789012
ALLOWED_USERNAMES=username1,username2
```

| Переменная | Обязательна | Описание |
|---|---|---|
| `BOT_TOKEN` | да | Токен Telegram Bot API |
| `OPENROUTER_API_KEY` | да | Ключ OpenRouter API |
| `ALLOWED_USER_IDS` | нет | Telegram user ID через запятую |
| `ALLOWED_USERNAMES` | нет | Telegram username через запятую |

## Запуск

```bash
# Development (hot-reload)
npm run dev

# Production
npm run start
```

## Использование

1. Отправьте боту фотографию с текстовым описанием товара в одном сообщении
2. Выберите формат карточки (1:1, 3:4, 4:3, 9:16)
3. Дождитесь генерации

Для конкретных надписей на карточке используйте кавычки: `"Скидка 30%"`, `"Хит продаж"`.

## Команды

- `/start` — главное меню
- `/provider` — текущий AI-провайдер
- `/provider <name>` — переключить провайдер

## Структура проекта

```
src/
├── bot.ts              # Entry point
├── config.ts           # Env parsing
├── handlers/
│   ├── start.ts        # /start command
│   ├── menu.ts         # Menu screens
│   ├── generate.ts     # Photo+text -> AI generation
│   └── provider.ts     # /provider command
├── keyboards/
│   └── index.ts        # Inline keyboards
├── middleware/
│   └── whitelist.ts    # Access control
├── providers/
│   ├── types.ts        # CardProvider interface
│   ├── registry.ts     # Provider registry
│   └── openrouter.ts   # OpenRouter provider
└── texts/
    └── index.ts        # UI text constants
```

## Лицензия

MIT
