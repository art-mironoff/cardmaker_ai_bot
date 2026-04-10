import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Database from "better-sqlite3";
import { createTestDb } from "../helpers/db.js";
import { createMockContext } from "../helpers/context.js";

let db: Database.Database;

const ADMIN_ID = 111;
const USER_ID = 12345;

vi.mock("../../src/db/index.js", () => ({
  getDb: () => db,
}));

vi.mock("../../src/config.js", () => ({
  config: {
    adminIds: [ADMIN_ID],
  },
}));

const {
  handleAdminCommand,
  handleAdminCallback,
  handleAdminTextInput,
  handleAdminMediaInput,
} = await import("../../src/handlers/admin.js");

const { getUser } = await import("../../src/db/users.js");
const { setSetting } = await import("../../src/db/settings.js");

function createUser(telegramId: number, username: string, balance = 0): void {
  db.prepare(
    "INSERT INTO users (telegram_id, username, first_name, balance) VALUES (?, ?, ?, ?)",
  ).run(telegramId, username, username, balance);
}

describe("handlers/admin", () => {
  beforeEach(() => {
    db = createTestDb();
    createUser(ADMIN_ID, "admin", 50000);
    createUser(USER_ID, "testuser", 10000);
  });

  afterEach(() => {
    db.close();
  });

  // --- Access control ---

  describe("access control", () => {
    it("handleAdminCommand ignores non-admin", async () => {
      const ctx = createMockContext({ userId: USER_ID });
      await handleAdminCommand(ctx);
      expect(ctx.reply).not.toHaveBeenCalled();
    });

    it("handleAdminCommand shows admin menu for admin", async () => {
      const ctx = createMockContext({ userId: ADMIN_ID });
      await handleAdminCommand(ctx);
      expect(ctx.reply).toHaveBeenCalled();
      const [text] = (ctx.reply as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(text).toContain("администратора");
    });

    it("handleAdminCallback rejects non-admin", async () => {
      const ctx = createMockContext({
        userId: USER_ID,
        callbackData: "admin:menu",
        callbackMessageId: 1,
      });
      await handleAdminCallback(ctx);
      expect(ctx.answerCallbackQuery).toHaveBeenCalledWith({ text: "Нет доступа" });
    });

    it("handleAdminTextInput returns false for non-admin", async () => {
      const ctx = createMockContext({ userId: USER_ID, messageText: "some text" });
      const result = await handleAdminTextInput(ctx);
      expect(result).toBe(false);
    });

    it("handleAdminMediaInput returns false for non-admin", async () => {
      const ctx = createMockContext({
        userId: USER_ID,
        messagePhoto: [{ file_id: "photo_1", width: 800, height: 600 }],
      });
      const result = await handleAdminMediaInput(ctx);
      expect(result).toBe(false);
    });
  });

  // --- Admin menu navigation ---

  describe("admin menu", () => {
    it("shows admin menu on admin:menu callback", async () => {
      const ctx = createMockContext({
        userId: ADMIN_ID,
        callbackData: "admin:menu",
        callbackMessageId: 1,
      });
      await handleAdminCallback(ctx);
      expect(ctx.editMessageText).toHaveBeenCalled();
      const [text] = (ctx.editMessageText as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(text).toContain("администратора");
    });

    it("shows statistics", async () => {
      const ctx = createMockContext({
        userId: ADMIN_ID,
        callbackData: "admin:stats",
        callbackMessageId: 1,
      });
      await handleAdminCallback(ctx);
      const [text] = (ctx.editMessageText as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(text).toContain("Статистика");
      expect(text).toContain("Пользователи");
      expect(text).toContain("Генерации");
    });

    it("shows settings", async () => {
      const ctx = createMockContext({
        userId: ADMIN_ID,
        callbackData: "admin:settings",
        callbackMessageId: 1,
      });
      await handleAdminCallback(ctx);
      const [text] = (ctx.editMessageText as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(text).toContain("Настройки");
      expect(text).toContain("Цена генерации");
    });

    it("shows user list", async () => {
      const ctx = createMockContext({
        userId: ADMIN_ID,
        callbackData: "admin:users:0",
        callbackMessageId: 1,
      });
      await handleAdminCallback(ctx);
      const [text] = (ctx.editMessageText as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(text).toContain("Пользователи");
    });
  });

  // --- Balance operations ---

  describe("balance operations", () => {
    it("addbal: adds balance to user", async () => {
      // Step 1: Enter addbal mode
      const cbCtx = createMockContext({
        userId: ADMIN_ID,
        callbackData: `admin:addbal:${USER_ID}:0`,
        callbackMessageId: 1,
      });
      await handleAdminCallback(cbCtx);
      expect(cbCtx.editMessageText).toHaveBeenCalled();

      // Step 2: Send amount
      const textCtx = createMockContext({
        userId: ADMIN_ID,
        messageText: "100",
      });
      const handled = await handleAdminTextInput(textCtx);
      expect(handled).toBe(true);

      // Verify balance
      const user = getUser(USER_ID);
      expect(user!.balance).toBe(20000); // 10000 + 100*100
    });

    it("subbal: subtracts balance from user", async () => {
      // Step 1: Enter subbal mode
      const cbCtx = createMockContext({
        userId: ADMIN_ID,
        callbackData: `admin:subbal:${USER_ID}:0`,
        callbackMessageId: 1,
      });
      await handleAdminCallback(cbCtx);

      // Step 2: Send amount
      const textCtx = createMockContext({
        userId: ADMIN_ID,
        messageText: "50",
      });
      const handled = await handleAdminTextInput(textCtx);
      expect(handled).toBe(true);

      const user = getUser(USER_ID);
      expect(user!.balance).toBe(5000); // 10000 - 50*100
    });

    it("rejects invalid amount", async () => {
      const cbCtx = createMockContext({
        userId: ADMIN_ID,
        callbackData: `admin:addbal:${USER_ID}:0`,
        callbackMessageId: 1,
      });
      await handleAdminCallback(cbCtx);

      const textCtx = createMockContext({
        userId: ADMIN_ID,
        messageText: "abc",
      });
      const handled = await handleAdminTextInput(textCtx);
      expect(handled).toBe(true);

      const [text] = (textCtx.reply as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(text).toContain("Некорректная сумма");
    });

    it("rejects amount exceeding max", async () => {
      const cbCtx = createMockContext({
        userId: ADMIN_ID,
        callbackData: `admin:addbal:${USER_ID}:0`,
        callbackMessageId: 1,
      });
      await handleAdminCallback(cbCtx);

      const textCtx = createMockContext({
        userId: ADMIN_ID,
        messageText: "99999",
      });
      const handled = await handleAdminTextInput(textCtx);
      expect(handled).toBe(true);

      const [text] = (textCtx.reply as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(text).toContain("Некорректная сумма");
    });
  });

  // --- Settings ---

  describe("settings", () => {
    it("set_price: updates generation price", async () => {
      const cbCtx = createMockContext({
        userId: ADMIN_ID,
        callbackData: "admin:set:generation_price",
        callbackMessageId: 1,
      });
      await handleAdminCallback(cbCtx);

      const textCtx = createMockContext({
        userId: ADMIN_ID,
        messageText: "75",
      });
      const handled = await handleAdminTextInput(textCtx);
      expect(handled).toBe(true);

      const row = db.prepare("SELECT value FROM settings WHERE key = 'generation_price'").get() as { value: string };
      expect(row.value).toBe("7500"); // 75 rubles = 7500 kopecks
    });

    it("set_welcome: updates welcome balance", async () => {
      const cbCtx = createMockContext({
        userId: ADMIN_ID,
        callbackData: "admin:set:welcome_balance",
        callbackMessageId: 1,
      });
      await handleAdminCallback(cbCtx);

      const textCtx = createMockContext({
        userId: ADMIN_ID,
        messageText: "100",
      });
      const handled = await handleAdminTextInput(textCtx);
      expect(handled).toBe(true);

      const row = db.prepare("SELECT value FROM settings WHERE key = 'welcome_balance'").get() as { value: string };
      expect(row.value).toBe("10000");
    });
  });

  // --- Block/unblock ---

  describe("block/unblock", () => {
    it("toggles user block status", async () => {
      expect(getUser(USER_ID)!.is_blocked).toBe(0);

      const ctx = createMockContext({
        userId: ADMIN_ID,
        callbackData: `admin:block:${USER_ID}:0`,
        callbackMessageId: 1,
      });
      await handleAdminCallback(ctx);

      expect(getUser(USER_ID)!.is_blocked).toBe(1);
    });

    it("toggles back to unblocked", async () => {
      // Block first
      db.prepare("UPDATE users SET is_blocked = 1 WHERE telegram_id = ?").run(USER_ID);

      const ctx = createMockContext({
        userId: ADMIN_ID,
        callbackData: `admin:block:${USER_ID}:0`,
        callbackMessageId: 1,
      });
      await handleAdminCallback(ctx);

      expect(getUser(USER_ID)!.is_blocked).toBe(0);
    });
  });

  // --- Broadcast ---

  describe("broadcast", () => {
    beforeEach(() => {
      // Create more users for broadcast testing
      createUser(200, "user200");
      createUser(201, "user201");
    });

    it("broadcasts text message to all users", async () => {
      // Step 1: Enter broadcast mode
      const cbCtx = createMockContext({
        userId: ADMIN_ID,
        callbackData: "admin:broadcast",
        callbackMessageId: 1,
      });
      await handleAdminCallback(cbCtx);
      expect(cbCtx.editMessageText).toHaveBeenCalled();
      const [promptText] = (cbCtx.editMessageText as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(promptText).toContain("рассылки");

      // Step 2: Send text message
      const textCtx = createMockContext({
        userId: ADMIN_ID,
        messageText: "Hello everyone!",
      });
      const handled = await handleAdminTextInput(textCtx);
      expect(handled).toBe(true);

      // Should have sent to all non-blocked users (admin + user + user200 + user201 = 4)
      expect(textCtx.api.sendMessage).toHaveBeenCalled();
      const sendCalls = (textCtx.api.sendMessage as ReturnType<typeof vi.fn>).mock.calls;
      expect(sendCalls.length).toBe(4);
    });

    it("skips blocked users in broadcast", async () => {
      db.prepare("UPDATE users SET is_blocked = 1 WHERE telegram_id = ?").run(200);

      const cbCtx = createMockContext({
        userId: ADMIN_ID,
        callbackData: "admin:broadcast",
        callbackMessageId: 1,
      });
      await handleAdminCallback(cbCtx);

      const textCtx = createMockContext({
        userId: ADMIN_ID,
        messageText: "Hello!",
      });
      await handleAdminTextInput(textCtx);

      // User 200 is blocked, should be 3 sends
      const sendCalls = (textCtx.api.sendMessage as ReturnType<typeof vi.fn>).mock.calls;
      expect(sendCalls.length).toBe(3);
    });

    it("reports broadcast results", async () => {
      const cbCtx = createMockContext({
        userId: ADMIN_ID,
        callbackData: "admin:broadcast",
        callbackMessageId: 1,
      });
      await handleAdminCallback(cbCtx);

      const textCtx = createMockContext({
        userId: ADMIN_ID,
        messageText: "Hello!",
      });
      await handleAdminTextInput(textCtx);

      // Check result message
      const replyCalls = (textCtx.reply as ReturnType<typeof vi.fn>).mock.calls;
      const resultMsg = replyCalls.find((c: unknown[]) => (c[0] as string).includes("Рассылка завершена"));
      expect(resultMsg).toBeDefined();
    });

    // *** THE CRITICAL BUG TEST ***

    it("broadcasts photo when admin is in broadcast mode (not generation)", async () => {
      // Step 1: Enter broadcast mode
      const cbCtx = createMockContext({
        userId: ADMIN_ID,
        callbackData: "admin:broadcast",
        callbackMessageId: 1,
      });
      await handleAdminCallback(cbCtx);

      // Step 2: Send photo+caption — should BROADCAST, not trigger generation
      const photoCtx = createMockContext({
        userId: ADMIN_ID,
        messagePhoto: [{ file_id: "broadcast_photo", width: 800, height: 600 }],
        messageCaption: "Check out our new feature!",
        messageId: 42,
      });
      const handled = await handleAdminMediaInput(photoCtx);

      expect(handled).toBe(true);
      // copyMessage should be called for each non-blocked user
      const copyCalls = (photoCtx.api.copyMessage as ReturnType<typeof vi.fn>).mock.calls;
      expect(copyCalls.length).toBe(4); // admin + user + user200 + user201
      // Verify copyMessage was called with correct params
      expect(copyCalls[0][1]).toBe(ADMIN_ID); // from_chat_id = admin's chat
      expect(copyCalls[0][2]).toBe(42); // message_id
    });

    it("broadcasts document when admin is in broadcast mode", async () => {
      const cbCtx = createMockContext({
        userId: ADMIN_ID,
        callbackData: "admin:broadcast",
        callbackMessageId: 1,
      });
      await handleAdminCallback(cbCtx);

      const docCtx = createMockContext({
        userId: ADMIN_ID,
        messageDocument: { file_id: "doc_123", mime_type: "image/jpeg", file_size: 1000 },
        messageCaption: "Important document",
        messageId: 55,
      });
      const handled = await handleAdminMediaInput(docCtx);

      expect(handled).toBe(true);
      const copyCalls = (docCtx.api.copyMessage as ReturnType<typeof vi.fn>).mock.calls;
      expect(copyCalls.length).toBe(4);
    });
  });

  // --- Admin media input in non-broadcast states ---

  describe("handleAdminMediaInput in non-broadcast states", () => {
    it("returns false when no admin input state", async () => {
      const ctx = createMockContext({
        userId: ADMIN_ID,
        messagePhoto: [{ file_id: "photo_1", width: 800, height: 600 }],
      });
      const result = await handleAdminMediaInput(ctx);
      expect(result).toBe(false);
    });

    it("shows text-expected message when in addbal mode", async () => {
      // Enter addbal mode
      const cbCtx = createMockContext({
        userId: ADMIN_ID,
        callbackData: `admin:addbal:${USER_ID}:0`,
        callbackMessageId: 1,
      });
      await handleAdminCallback(cbCtx);

      // Send photo instead of text
      const photoCtx = createMockContext({
        userId: ADMIN_ID,
        messagePhoto: [{ file_id: "photo_1", width: 800, height: 600 }],
      });
      const handled = await handleAdminMediaInput(photoCtx);

      expect(handled).toBe(true);
      expect(photoCtx.reply).toHaveBeenCalled();
      const [text] = (photoCtx.reply as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(text).toContain("текстовое сообщение");
    });

    it("preserves input state after photo rejection (can retry with text)", async () => {
      // Enter set_price mode
      const cbCtx = createMockContext({
        userId: ADMIN_ID,
        callbackData: "admin:set:generation_price",
        callbackMessageId: 1,
      });
      await handleAdminCallback(cbCtx);

      // Send photo — should be rejected but state preserved
      const photoCtx = createMockContext({
        userId: ADMIN_ID,
        messagePhoto: [{ file_id: "photo_1", width: 800, height: 600 }],
      });
      await handleAdminMediaInput(photoCtx);

      // Now send text — should still work
      const textCtx = createMockContext({
        userId: ADMIN_ID,
        messageText: "100",
      });
      const handled = await handleAdminTextInput(textCtx);
      expect(handled).toBe(true);

      // Verify price was updated
      const row = db.prepare("SELECT value FROM settings WHERE key = 'generation_price'").get() as { value: string };
      expect(row.value).toBe("10000");
    });
  });

  // --- Cancel input ---

  describe("cancel input", () => {
    it("clears admin input state on cancel", async () => {
      // Enter broadcast mode
      const cbCtx = createMockContext({
        userId: ADMIN_ID,
        callbackData: "admin:broadcast",
        callbackMessageId: 1,
      });
      await handleAdminCallback(cbCtx);

      // Cancel
      const cancelCtx = createMockContext({
        userId: ADMIN_ID,
        callbackData: "admin:cancel_input",
        callbackMessageId: 1,
      });
      await handleAdminCallback(cancelCtx);

      // Verify state is cleared — text input should not be handled
      const textCtx = createMockContext({
        userId: ADMIN_ID,
        messageText: "Should not broadcast",
      });
      const handled = await handleAdminTextInput(textCtx);
      expect(handled).toBe(false);
    });
  });

  // --- Text input without state ---

  describe("handleAdminTextInput without state", () => {
    it("returns false when no admin input state", async () => {
      const ctx = createMockContext({
        userId: ADMIN_ID,
        messageText: "random text",
      });
      const result = await handleAdminTextInput(ctx);
      expect(result).toBe(false);
    });
  });

  // --- Empty user list (high page offset) ---

  describe("user list: empty page", () => {
    it("shows 'no users' message when page offset exceeds total", async () => {
      const ctx = createMockContext({
        userId: ADMIN_ID,
        callbackData: "admin:users:100",
        callbackMessageId: 1,
      });
      await handleAdminCallback(ctx);
      const [text] = (ctx.editMessageText as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(text).toContain("Пользователей пока нет.");
    });
  });

  // --- User detail ---

  describe("user detail", () => {
    it("displays balance, status, and registration date", async () => {
      const ctx = createMockContext({
        userId: ADMIN_ID,
        callbackData: `admin:user:${USER_ID}:0`,
        callbackMessageId: 1,
      });
      await handleAdminCallback(ctx);
      const [text] = (ctx.editMessageText as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(text).toContain("Баланс:");
      expect(text).toContain("100 ₽"); // 10000 kopecks = 100 rubles
      expect(text).toContain("Статус:");
      expect(text).toContain("Активен");
      expect(text).toContain("Регистрация:");
      expect(text).toContain(`ID: ${USER_ID}`);
    });

    it("shows 'not found' for nonexistent user", async () => {
      const ctx = createMockContext({
        userId: ADMIN_ID,
        callbackData: "admin:user:999999:0",
        callbackMessageId: 1,
      });
      await handleAdminCallback(ctx);
      const [text] = (ctx.editMessageText as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(text).toContain("Пользователь не найден");
    });
  });

  // --- Recent generations ---

  describe("recent generations", () => {
    it("shows generation list with status", async () => {
      // Insert a completed generation via raw SQL
      db.prepare(
        "INSERT INTO generations (user_id, cost, provider, format, user_prompt, source_file_id, result_file_id, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      ).run(USER_ID, 5000, "openrouter", "1:1", "Test product card", "src_file_1", "res_file_1", "completed");

      const ctx = createMockContext({
        userId: ADMIN_ID,
        callbackData: "admin:recent_gens:0",
        callbackMessageId: 1,
      });
      await handleAdminCallback(ctx);
      const [text] = (ctx.editMessageText as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(text).toContain("Генерации");
      expect(text).toContain("Test product card");
      expect(text).toContain("✅ Готово");
    });

    it("shows empty message when no generations exist", async () => {
      const ctx = createMockContext({
        userId: ADMIN_ID,
        callbackData: "admin:recent_gens:0",
        callbackMessageId: 1,
      });
      await handleAdminCallback(ctx);
      const [text] = (ctx.editMessageText as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(text).toContain("Генераций пока нет.");
    });

    it("shows failed status for failed generation", async () => {
      db.prepare(
        "INSERT INTO generations (user_id, cost, provider, format, user_prompt, status) VALUES (?, ?, ?, ?, ?, ?)",
      ).run(USER_ID, 5000, "openrouter", "3:4", "Failed card", "failed");

      const ctx = createMockContext({
        userId: ADMIN_ID,
        callbackData: "admin:recent_gens:0",
        callbackMessageId: 1,
      });
      await handleAdminCallback(ctx);
      const [text] = (ctx.editMessageText as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(text).toContain("❌ Ошибка");
    });
  });

  // --- Generation detail ---

  describe("generation detail", () => {
    it("displays prompt and cost in detail view", async () => {
      const result = db.prepare(
        "INSERT INTO generations (user_id, cost, provider, format, user_prompt, source_file_id, result_file_id, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      ).run(USER_ID, 5000, "openrouter", "1:1", "Detailed product card prompt", "src_1", "res_1", "completed");
      const genId = Number(result.lastInsertRowid);

      const ctx = createMockContext({
        userId: ADMIN_ID,
        callbackData: `admin:gen_detail:${genId}:0`,
        callbackMessageId: 1,
      });
      await handleAdminCallback(ctx);
      const [text] = (ctx.editMessageText as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(text).toContain("Detailed product card prompt");
      expect(text).toContain("50"); // 5000 kopecks = 50 rubles
      expect(text).toContain("✅ Готово");
    });

    it("shows 'not found' for nonexistent generation", async () => {
      const ctx = createMockContext({
        userId: ADMIN_ID,
        callbackData: "admin:gen_detail:999999:0",
        callbackMessageId: 1,
      });
      await handleAdminCallback(ctx);
      const [text] = (ctx.editMessageText as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(text).toContain("Генерация не найдена");
    });
  });

  // --- Recent payments ---

  describe("recent payments", () => {
    it("shows payment list with statuses", async () => {
      // Insert payments via raw SQL
      db.prepare(
        "INSERT INTO payments (user_id, amount, status) VALUES (?, ?, ?)",
      ).run(USER_ID, 50000, "succeeded");
      db.prepare(
        "INSERT INTO payments (user_id, amount, status) VALUES (?, ?, ?)",
      ).run(USER_ID, 10000, "pending");

      const ctx = createMockContext({
        userId: ADMIN_ID,
        callbackData: "admin:recent_pays:0",
        callbackMessageId: 1,
      });
      await handleAdminCallback(ctx);
      const [text] = (ctx.editMessageText as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(text).toContain("Платежи");
      expect(text).toContain("✅ Оплачен");
      expect(text).toContain("⏳ Ожидание");
    });

    it("shows empty message when no payments exist", async () => {
      const ctx = createMockContext({
        userId: ADMIN_ID,
        callbackData: "admin:recent_pays:0",
        callbackMessageId: 1,
      });
      await handleAdminCallback(ctx);
      const [text] = (ctx.editMessageText as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(text).toContain("Платежей пока нет.");
    });
  });

  // --- Broadcast: rate limit (429) retry ---

  describe("broadcast: 429 rate limit retry", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      createUser(300, "user300");
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("retries on 429 error and counts success", async () => {
      // Enter broadcast mode
      const cbCtx = createMockContext({
        userId: ADMIN_ID,
        callbackData: "admin:broadcast",
        callbackMessageId: 1,
      });
      await handleAdminCallback(cbCtx);

      // Create text context where sendMessage fails with 429 for user 300 first time, then succeeds
      const textCtx = createMockContext({
        userId: ADMIN_ID,
        messageText: "Rate limited broadcast",
      });

      let user300Calls = 0;
      (textCtx.api.sendMessage as ReturnType<typeof vi.fn>).mockImplementation(
        async (chatId: number) => {
          if (chatId === 300) {
            user300Calls++;
            if (user300Calls === 1) {
              throw new Error("429 Too Many Requests");
            }
          }
          return { message_id: 300 };
        },
      );

      // Run broadcast in background and advance timers to resolve all sleeps
      const broadcastPromise = handleAdminTextInput(textCtx);
      // Advance timers repeatedly to resolve both sleep(50) and sleep(5000) calls
      for (let i = 0; i < 20; i++) {
        await vi.advanceTimersByTimeAsync(5100);
      }
      await broadcastPromise;

      // Verify result message: all 3 users should succeed (admin, testuser, user300)
      const replyCalls = (textCtx.reply as ReturnType<typeof vi.fn>).mock.calls;
      const resultMsg = replyCalls.find((c: unknown[]) => (c[0] as string).includes("Рассылка завершена"));
      expect(resultMsg).toBeDefined();
      expect(resultMsg![0]).toContain("Отправлено: 3");
      expect(resultMsg![0]).toContain("Не доставлено: 0");
    });

    it("counts as failed when retry also fails after 429", async () => {
      const cbCtx = createMockContext({
        userId: ADMIN_ID,
        callbackData: "admin:broadcast",
        callbackMessageId: 1,
      });
      await handleAdminCallback(cbCtx);

      const textCtx = createMockContext({
        userId: ADMIN_ID,
        messageText: "Double fail broadcast",
      });

      (textCtx.api.sendMessage as ReturnType<typeof vi.fn>).mockImplementation(
        async (chatId: number) => {
          if (chatId === 300) {
            throw new Error("429 Too Many Requests");
          }
          return { message_id: 300 };
        },
      );

      // Run broadcast in background and advance timers to resolve all sleeps
      const broadcastPromise = handleAdminTextInput(textCtx);
      for (let i = 0; i < 20; i++) {
        await vi.advanceTimersByTimeAsync(5100);
      }
      await broadcastPromise;

      const replyCalls = (textCtx.reply as ReturnType<typeof vi.fn>).mock.calls;
      const resultMsg = replyCalls.find((c: unknown[]) => (c[0] as string).includes("Рассылка завершена"));
      expect(resultMsg).toBeDefined();
      expect(resultMsg![0]).toContain("Отправлено: 2");
      expect(resultMsg![0]).toContain("Не доставлено: 1");
    });
  });

  // --- Goto page: validation ---

  describe("goto_page input validation", () => {
    it("rejects non-numeric page input", async () => {
      const cbCtx = createMockContext({
        userId: ADMIN_ID,
        callbackData: "admin:goto:admin:users:0",
        callbackMessageId: 1,
      });
      await handleAdminCallback(cbCtx);

      const textCtx = createMockContext({
        userId: ADMIN_ID,
        messageText: "abc",
      });
      const handled = await handleAdminTextInput(textCtx);
      expect(handled).toBe(true);

      const [text] = (textCtx.reply as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(text).toContain("Некорректный номер страницы");
    });

    it("rejects page number 0", async () => {
      const cbCtx = createMockContext({
        userId: ADMIN_ID,
        callbackData: "admin:goto:admin:users:0",
        callbackMessageId: 1,
      });
      await handleAdminCallback(cbCtx);

      const textCtx = createMockContext({
        userId: ADMIN_ID,
        messageText: "0",
      });
      const handled = await handleAdminTextInput(textCtx);
      expect(handled).toBe(true);

      const [text] = (textCtx.reply as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(text).toContain("Некорректный номер страницы");
    });

    it("rejects negative page number", async () => {
      const cbCtx = createMockContext({
        userId: ADMIN_ID,
        callbackData: "admin:goto:admin:users:0",
        callbackMessageId: 1,
      });
      await handleAdminCallback(cbCtx);

      const textCtx = createMockContext({
        userId: ADMIN_ID,
        messageText: "-1",
      });
      const handled = await handleAdminTextInput(textCtx);
      expect(handled).toBe(true);

      const [text] = (textCtx.reply as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(text).toContain("Некорректный номер страницы");
    });

    it("navigates to valid page for users list", async () => {
      const cbCtx = createMockContext({
        userId: ADMIN_ID,
        callbackData: "admin:goto:admin:users:0",
        callbackMessageId: 1,
      });
      await handleAdminCallback(cbCtx);

      const textCtx = createMockContext({
        userId: ADMIN_ID,
        messageText: "1",
      });
      const handled = await handleAdminTextInput(textCtx);
      expect(handled).toBe(true);

      // Page 1 (0-indexed page 0) should show users via ctx.reply (send mode)
      const replyCalls = (textCtx.reply as ReturnType<typeof vi.fn>).mock.calls;
      const pageMsg = replyCalls.find((c: unknown[]) => (c[0] as string).includes("Пользователи"));
      expect(pageMsg).toBeDefined();
    });

    it("navigates to valid page for generations list", async () => {
      const cbCtx = createMockContext({
        userId: ADMIN_ID,
        callbackData: "admin:goto:admin:recent_gens:0",
        callbackMessageId: 1,
      });
      await handleAdminCallback(cbCtx);

      const textCtx = createMockContext({
        userId: ADMIN_ID,
        messageText: "1",
      });
      const handled = await handleAdminTextInput(textCtx);
      expect(handled).toBe(true);

      const replyCalls = (textCtx.reply as ReturnType<typeof vi.fn>).mock.calls;
      const pageMsg = replyCalls.find((c: unknown[]) => (c[0] as string).includes("Генерации"));
      expect(pageMsg).toBeDefined();
    });

    it("navigates to valid page for payments list", async () => {
      const cbCtx = createMockContext({
        userId: ADMIN_ID,
        callbackData: "admin:goto:admin:recent_pays:0",
        callbackMessageId: 1,
      });
      await handleAdminCallback(cbCtx);

      const textCtx = createMockContext({
        userId: ADMIN_ID,
        messageText: "1",
      });
      const handled = await handleAdminTextInput(textCtx);
      expect(handled).toBe(true);

      const replyCalls = (textCtx.reply as ReturnType<typeof vi.fn>).mock.calls;
      const pageMsg = replyCalls.find((c: unknown[]) => (c[0] as string).includes("Платежи"));
      expect(pageMsg).toBeDefined();
    });
  });

  // TTL test skipped: requires module reload with fake timers since setInterval is
  // registered at import time with real timers, making vi.useFakeTimers() ineffective
  // for advancing the cleanup interval.
});
