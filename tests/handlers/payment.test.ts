import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Database from "better-sqlite3";
import { createTestDb } from "../helpers/db.js";
import { createMockContext } from "../helpers/context.js";

let db: Database.Database;

vi.mock("../../src/db/index.js", () => ({
  getDb: () => db,
}));

vi.mock("../../src/config.js", () => ({
  config: {
    adminIds: [],
    yoomoney: {
      walletId: "4100000000000",
      notificationSecret: "test_secret",
      returnUrl: "https://t.me/testbot",
    },
  },
}));

const { handleTopupCallback, handlePaymentAmountCallback } =
  await import("../../src/handlers/payment.js");
const { getPaymentById } = await import("../../src/db/payments.js");

function createUser(telegramId: number, balance = 10000): void {
  db.prepare(
    "INSERT INTO users (telegram_id, username, first_name, balance) VALUES (?, ?, ?, ?)",
  ).run(telegramId, "user" + telegramId, "User", balance);
}

describe("handlers/payment", () => {
  beforeEach(() => {
    db = createTestDb();
    createUser(100);
  });

  afterEach(() => {
    db.close();
  });

  describe("handleTopupCallback", () => {
    it("shows amount selection keyboard", async () => {
      const ctx = createMockContext({
        userId: 100,
        callbackData: "pay:topup",
        callbackMessageId: 1,
      });

      await handleTopupCallback(ctx);

      expect(ctx.answerCallbackQuery).toHaveBeenCalled();
      expect(ctx.editMessageText).toHaveBeenCalled();
      const [text, opts] = (ctx.editMessageText as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(text).toContain("сумму пополнения");
      expect(opts.reply_markup).toBeDefined();
    });
  });

  describe("handlePaymentAmountCallback", () => {
    it("creates payment and shows payment link", async () => {
      const ctx = createMockContext({
        userId: 100,
        callbackData: "pay:100",
        callbackMessageId: 1,
      });

      await handlePaymentAmountCallback(ctx);

      expect(ctx.editMessageText).toHaveBeenCalled();
      const [text, opts] = (ctx.editMessageText as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(text).toContain("100");

      // Payment URL button should be present
      const buttons = opts.reply_markup.inline_keyboard.flat();
      expect(buttons.some((b: { url?: string }) => b.url?.includes("yoomoney.ru"))).toBe(true);
    });

    it("creates payment record in DB", async () => {
      const ctx = createMockContext({
        userId: 100,
        callbackData: "pay:250",
        callbackMessageId: 1,
      });

      await handlePaymentAmountCallback(ctx);

      // Check DB for payment record
      const payment = getPaymentById(1);
      expect(payment).toBeDefined();
      expect(payment!.user_id).toBe(100);
      expect(payment!.amount).toBe(25000); // 250 * 100 kopecks
      expect(payment!.status).toBe("pending");
      expect(payment!.confirmation_url).toContain("yoomoney.ru");
    });

    it("ignores unknown amount callbacks", async () => {
      const ctx = createMockContext({
        userId: 100,
        callbackData: "pay:999",
        callbackMessageId: 1,
      });

      await handlePaymentAmountCallback(ctx);

      expect(ctx.editMessageText).not.toHaveBeenCalled();
    });

    it("shows error when wallet not configured", async () => {
      // Override config mock for this test
      const configModule = await import("../../src/config.js");
      const origWalletId = configModule.config.yoomoney.walletId;
      (configModule.config.yoomoney as { walletId: string }).walletId = "";

      const ctx = createMockContext({
        userId: 100,
        callbackData: "pay:100",
        callbackMessageId: 1,
      });

      await handlePaymentAmountCallback(ctx);

      const [text] = (ctx.editMessageText as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(text).toContain("недоступна");

      // Restore
      (configModule.config.yoomoney as { walletId: string }).walletId = origWalletId;
    });
  });
});
