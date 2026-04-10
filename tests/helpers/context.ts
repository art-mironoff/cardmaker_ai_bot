import { vi } from "vitest";
import type { BotContext } from "../../src/context.js";

interface MockContextOptions {
  userId?: number;
  username?: string;
  firstName?: string;
  balance?: number;
  isBlocked?: number;
  consentGiven?: number;
  messageText?: string;
  messagePhoto?: Array<{ file_id: string; width: number; height: number }>;
  messageCaption?: string;
  messageDocument?: { file_id: string; mime_type?: string; file_size?: number };
  messageId?: number;
  callbackData?: string;
  callbackMessageId?: number;
}

export function createMockContext(opts: MockContextOptions = {}): BotContext {
  const userId = opts.userId ?? 12345;

  const callbackQuery = opts.callbackData
    ? {
        id: "cb_1",
        data: opts.callbackData,
        chat_instance: "test",
        message: opts.callbackMessageId !== undefined
          ? { message_id: opts.callbackMessageId, chat: { id: userId } }
          : undefined,
      }
    : undefined;

  const message: Record<string, unknown> = {
    message_id: opts.messageId ?? 100,
    chat: { id: userId },
    date: Math.floor(Date.now() / 1000),
  };
  if (opts.messageText !== undefined) message.text = opts.messageText;
  if (opts.messagePhoto) message.photo = opts.messagePhoto;
  if (opts.messageCaption !== undefined) message.caption = opts.messageCaption;
  if (opts.messageDocument) message.document = opts.messageDocument;

  const hasMessage =
    opts.messageText !== undefined ||
    opts.messagePhoto !== undefined ||
    opts.messageDocument !== undefined ||
    opts.messageCaption !== undefined;

  return {
    from: { id: userId, username: opts.username ?? "testuser", first_name: opts.firstName ?? "Test" },
    chat: { id: userId },
    message: hasMessage ? message : undefined,
    callbackQuery,
    dbUser: {
      telegram_id: userId,
      username: opts.username ?? "testuser",
      first_name: opts.firstName ?? "Test",
      balance: opts.balance ?? 10000,
      is_blocked: opts.isBlocked ?? 0,
      consent_given: opts.consentGiven ?? 0,
      created_at: "2024-01-01 00:00:00",
      last_active: "2024-01-01 00:00:00",
    },
    reply: vi.fn().mockResolvedValue({ message_id: 200 }),
    editMessageText: vi.fn().mockResolvedValue(true),
    answerCallbackQuery: vi.fn().mockResolvedValue(true),
    deleteMessage: vi.fn().mockResolvedValue(true),
    replyWithPhoto: vi.fn().mockResolvedValue({
      message_id: 201,
      photo: [{ file_id: "result_photo_id" }],
    }),
    replyWithDocument: vi.fn().mockResolvedValue({ message_id: 202 }),
    api: {
      sendMessage: vi.fn().mockResolvedValue({ message_id: 300 }),
      sendChatAction: vi.fn().mockResolvedValue(true),
      getFile: vi.fn().mockResolvedValue({ file_path: "photos/test.jpg" }),
      editMessageText: vi.fn().mockResolvedValue(true),
      deleteMessage: vi.fn().mockResolvedValue(true),
      copyMessage: vi.fn().mockResolvedValue({ message_id: 301 }),
      token: "test-bot-token",
    },
  } as unknown as BotContext;
}
