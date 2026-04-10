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
    adminIds: [111],
  },
}));

const {
  handleHelpCallback,
  handleBalanceCallback,
  handleInfoCallback,
  handleBackToStart,
  handleHelpRecommendations,
  handleHelpImageFormat,
  handleTariffsCallback,
  handleBackToBalance,
  handleInfoTerms,
} = await import("../../src/handlers/menu.js");

describe("handlers/menu", () => {
  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    db.close();
  });

  describe("handleHelpCallback", () => {
    it("sends help menu text via edit when callback", async () => {
      const ctx = createMockContext({
        callbackData: "menu:help",
        callbackMessageId: 1,
      });
      await handleHelpCallback(ctx);

      expect(ctx.answerCallbackQuery).toHaveBeenCalled();
      expect(ctx.editMessageText).toHaveBeenCalled();
    });

    it("sends help menu text via reply when no callback message", async () => {
      const ctx = createMockContext({ messageText: "/help" });
      await handleHelpCallback(ctx);

      expect(ctx.reply).toHaveBeenCalled();
    });
  });

  describe("handleBalanceCallback", () => {
    it("shows balance in rubles (converts from kopecks)", async () => {
      const ctx = createMockContext({
        balance: 15000, // 150 rubles
        callbackData: "menu:balance",
        callbackMessageId: 1,
      });
      await handleBalanceCallback(ctx);

      const [text] = (ctx.editMessageText as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(text).toContain("150");
    });

    it("shows 0 balance correctly", async () => {
      const ctx = createMockContext({
        balance: 0,
        callbackData: "menu:balance",
        callbackMessageId: 1,
      });
      await handleBalanceCallback(ctx);

      const [text] = (ctx.editMessageText as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(text).toContain("0");
    });
  });

  describe("handleInfoCallback", () => {
    it("sends info menu", async () => {
      const ctx = createMockContext({
        callbackData: "menu:info",
        callbackMessageId: 1,
      });
      await handleInfoCallback(ctx);
      expect(ctx.editMessageText).toHaveBeenCalled();
    });
  });

  describe("handleBackToStart", () => {
    it("sends welcome text with main menu keyboard", async () => {
      const ctx = createMockContext({
        callbackData: "back:start",
        callbackMessageId: 1,
      });
      await handleBackToStart(ctx);
      expect(ctx.editMessageText).toHaveBeenCalled();
      const [text] = (ctx.editMessageText as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(text).toContain("генерации карточки");
    });
  });

  describe("handleHelpRecommendations", () => {
    it("shows recommendations text", async () => {
      const ctx = createMockContext({
        callbackData: "help:recommendations",
        callbackMessageId: 1,
      });
      await handleHelpRecommendations(ctx);
      const [text] = (ctx.editMessageText as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(text).toContain("Рекомендации");
    });
  });

  describe("handleHelpImageFormat", () => {
    it("shows image format help", async () => {
      const ctx = createMockContext({
        callbackData: "help:image_format",
        callbackMessageId: 1,
      });
      await handleHelpImageFormat(ctx);
      const [text] = (ctx.editMessageText as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(text).toContain("1:1");
    });
  });

  describe("handleTariffsCallback", () => {
    it("shows tariffs with generation price", async () => {
      const ctx = createMockContext({
        callbackData: "menu:tariffs",
        callbackMessageId: 1,
      });
      await handleTariffsCallback(ctx);
      const [text] = (ctx.editMessageText as ReturnType<typeof vi.fn>).mock.calls[0];
      // Default price: 5000 kopecks = 50 rubles
      expect(text).toContain("50");
    });

    it("reflects updated generation price", async () => {
      db.prepare("UPDATE settings SET value = '10000' WHERE key = 'generation_price'").run();
      const ctx = createMockContext({
        callbackData: "menu:tariffs",
        callbackMessageId: 1,
      });
      await handleTariffsCallback(ctx);
      const [text] = (ctx.editMessageText as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(text).toContain("100");
    });
  });

  describe("handleBackToBalance", () => {
    it("shows balance with balance keyboard", async () => {
      const ctx = createMockContext({
        balance: 25000,
        callbackData: "back:balance",
        callbackMessageId: 1,
      });
      await handleBackToBalance(ctx);
      const [text] = (ctx.editMessageText as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(text).toContain("250");
    });
  });

  describe("handleInfoTerms", () => {
    it("shows terms text with URL buttons", async () => {
      const ctx = createMockContext({
        callbackData: "info:terms",
        callbackMessageId: 1,
      });
      await handleInfoTerms(ctx);
      const [text, opts] = (ctx.editMessageText as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(text).toContain("AS IS");
      // terms keyboard has URL buttons
      const buttons = opts.reply_markup.inline_keyboard.flat();
      expect(buttons.some((b: { url?: string }) => b.url)).toBe(true);
    });
  });

  describe("safeEditOrReply error handling", () => {
    it("ignores 'message is not modified' error", async () => {
      const ctx = createMockContext({
        callbackData: "menu:help",
        callbackMessageId: 1,
      });
      (ctx.editMessageText as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error("Bad Request: message is not modified"),
      );

      // Should not throw
      await expect(handleHelpCallback(ctx)).resolves.toBeUndefined();
    });

    it("rethrows other errors", async () => {
      const ctx = createMockContext({
        callbackData: "menu:help",
        callbackMessageId: 1,
      });
      (ctx.editMessageText as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error("Network error"),
      );

      await expect(handleHelpCallback(ctx)).rejects.toThrow("Network error");
    });
  });
});
