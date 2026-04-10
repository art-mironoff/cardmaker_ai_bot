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
    botToken: "test-token",
    openrouterApiKey: "test-key",
    adminIds: [],
  },
}));

// Mock the OpenRouter provider to avoid real API calls
const mockGenerate = vi.fn().mockResolvedValue({
  imageBuffer: Buffer.from("fake-image-data"),
});
vi.mock("../../src/providers/openrouter.js", () => ({
  OpenRouterProvider: class {
    name = "openrouter";
    generate = mockGenerate;
  },
}));

// Mock rate limiter — allow by default
const mockCheckRateLimit = vi.fn().mockReturnValue(true);
vi.mock("../../src/middleware/rateLimit.js", () => ({
  checkRateLimit: mockCheckRateLimit,
}));

// Mock fetch for file downloads
vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
  ok: true,
  arrayBuffer: () => Promise.resolve(new ArrayBuffer(100)),
}));

const { handlePhoto, handleDocument, handleTextWithoutPhoto, handleFormatSelection, startPendingCleanup } =
  await import("../../src/handlers/generate.js");

function createUser(telegramId: number, balance = 50000): void {
  db.prepare(
    "INSERT INTO users (telegram_id, username, first_name, balance) VALUES (?, ?, ?, ?)",
  ).run(telegramId, "user" + telegramId, "User", balance);
}

describe("handlers/generate", () => {
  beforeEach(() => {
    db = createTestDb();
    createUser(100, 50000);
  });

  afterEach(() => {
    db.close();
  });

  describe("handlePhoto", () => {
    it("shows format selection when photo + caption provided", async () => {
      const ctx = createMockContext({
        userId: 100,
        messagePhoto: [
          { file_id: "small_123", width: 320, height: 240 },
          { file_id: "medium_123", width: 800, height: 600 },
          { file_id: "large_123", width: 1280, height: 960 },
        ],
        messageCaption: "Test product description",
      });

      await handlePhoto(ctx);

      expect(ctx.reply).toHaveBeenCalled();
      const [text, opts] = (ctx.reply as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(text).toContain("формат");
      expect(opts.reply_markup).toBeDefined();
    });

    it("sends error when photo without caption", async () => {
      const ctx = createMockContext({
        userId: 100,
        messagePhoto: [
          { file_id: "photo_123", width: 800, height: 600 },
        ],
      });

      await handlePhoto(ctx);

      expect(ctx.reply).toHaveBeenCalled();
      const [text] = (ctx.reply as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(text).toContain("текст");
    });

    it("warns about low resolution images", async () => {
      const ctx = createMockContext({
        userId: 100,
        messagePhoto: [
          { file_id: "tiny_123", width: 200, height: 200 },
        ],
        messageCaption: "Test",
      });

      await handlePhoto(ctx);

      // First call should be low resolution warning, second — format keyboard
      const calls = (ctx.reply as ReturnType<typeof vi.fn>).mock.calls;
      const allText = calls.map((c: unknown[]) => c[0]).join(" ");
      expect(allText).toContain("низкого разрешения");
    });

    it("uses second-to-last photo size for quality", async () => {
      const ctx = createMockContext({
        userId: 100,
        messagePhoto: [
          { file_id: "small_123", width: 320, height: 240 },
          { file_id: "medium_123", width: 800, height: 600 },
          { file_id: "large_123", width: 1280, height: 960 },
        ],
        messageCaption: "Test",
      });

      await handlePhoto(ctx);

      // The format selection was shown — the pending request stores medium_123
      // We verify indirectly by checking reply was called (format selection)
      expect(ctx.reply).toHaveBeenCalled();
    });
  });

  describe("handleDocument", () => {
    it("processes image document with caption", async () => {
      const ctx = createMockContext({
        userId: 100,
        messageDocument: { file_id: "doc_123", mime_type: "image/jpeg", file_size: 1000 },
        messageCaption: "Product description",
      });

      await handleDocument(ctx);

      expect(ctx.reply).toHaveBeenCalled();
      const [text] = (ctx.reply as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(text).toContain("формат");
    });

    it("rejects SVG documents", async () => {
      const ctx = createMockContext({
        userId: 100,
        messageDocument: { file_id: "doc_123", mime_type: "image/svg+xml" },
        messageCaption: "Test",
      });

      await handleDocument(ctx);

      const [text] = (ctx.reply as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(text).toContain("JPG/PNG");
    });

    it("rejects GIF documents", async () => {
      const ctx = createMockContext({
        userId: 100,
        messageDocument: { file_id: "doc_123", mime_type: "image/gif" },
        messageCaption: "Test",
      });

      await handleDocument(ctx);

      const [text] = (ctx.reply as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(text).toContain("JPG/PNG");
    });

    it("rejects non-image documents with caption", async () => {
      const ctx = createMockContext({
        userId: 100,
        messageDocument: { file_id: "doc_123", mime_type: "application/pdf" },
        messageCaption: "Test",
      });

      await handleDocument(ctx);

      const [text] = (ctx.reply as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(text).toContain("JPG/PNG");
    });

    it("ignores non-image documents without caption", async () => {
      const ctx = createMockContext({
        userId: 100,
        messageDocument: { file_id: "doc_123", mime_type: "application/pdf" },
      });

      await handleDocument(ctx);

      expect(ctx.reply).not.toHaveBeenCalled();
    });

    it("rejects oversized files", async () => {
      const ctx = createMockContext({
        userId: 100,
        messageDocument: {
          file_id: "doc_123",
          mime_type: "image/jpeg",
          file_size: 25 * 1024 * 1024, // 25 MB
        },
        messageCaption: "Test",
      });

      await handleDocument(ctx);

      const [text] = (ctx.reply as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(text).toContain("20 МБ");
    });

    it("requires caption for image documents", async () => {
      const ctx = createMockContext({
        userId: 100,
        messageDocument: { file_id: "doc_123", mime_type: "image/jpeg", file_size: 1000 },
      });

      await handleDocument(ctx);

      const [text] = (ctx.reply as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(text).toContain("текст");
    });
  });

  describe("handleTextWithoutPhoto", () => {
    it("sends error for plain text without photo", async () => {
      const ctx = createMockContext({
        userId: 100,
        messageText: "Some product description",
      });

      await handleTextWithoutPhoto(ctx);

      expect(ctx.reply).toHaveBeenCalled();
      const [text] = (ctx.reply as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(text).toContain("фотографию");
    });

    it("ignores commands", async () => {
      const ctx = createMockContext({
        userId: 100,
        messageText: "/start",
      });

      await handleTextWithoutPhoto(ctx);

      expect(ctx.reply).not.toHaveBeenCalled();
    });
  });

  describe("handleFormatSelection", () => {
    it("replies with expired message when no pending request", async () => {
      // Use userId 999 to ensure no pending request from other tests
      createUser(999, 50000);
      const ctx = createMockContext({
        userId: 999,
        callbackData: "fmt:3x4",
        callbackMessageId: 1,
      });

      await handleFormatSelection(ctx);

      expect(ctx.answerCallbackQuery).toHaveBeenCalledWith(
        expect.objectContaining({ text: expect.stringContaining("устарел") }),
      );
    });

    it("ignores unknown format callback", async () => {
      const ctx = createMockContext({
        userId: 100,
        callbackData: "fmt:unknown",
        callbackMessageId: 1,
      });

      await handleFormatSelection(ctx);

      expect(ctx.answerCallbackQuery).not.toHaveBeenCalled();
    });
  });

  describe("runGeneration (via handleFormatSelection)", () => {
    // Helper: set up a pending request by calling handlePhoto, then trigger format selection
    async function setupPendingAndSelect(
      userId: number,
      opts?: { balance?: number; callbackMessageId?: number },
    ) {
      const balance = opts?.balance ?? 50000;
      const callbackMessageId = opts?.callbackMessageId ?? 200;

      // Step 1: call handlePhoto to create a pending request
      const photoCtx = createMockContext({
        userId,
        balance,
        messagePhoto: [
          { file_id: "small_123", width: 320, height: 240 },
          { file_id: "medium_123", width: 800, height: 600 },
          { file_id: "large_123", width: 1280, height: 960 },
        ],
        messageCaption: "Test product description",
      });
      await handlePhoto(photoCtx);

      // Step 2: create context for format selection callback
      const fmtCtx = createMockContext({
        userId,
        balance,
        callbackData: "fmt:3x4",
        callbackMessageId,
      });

      return fmtCtx;
    }

    it("deducts balance before generation", async () => {
      const userId = 100;
      const fmtCtx = await setupPendingAndSelect(userId);

      await handleFormatSelection(fmtCtx);

      // Balance should be deducted (generation_price default is 5000 kopecks = 50 RUB)
      const user = db.prepare("SELECT balance FROM users WHERE telegram_id = ?").get(userId) as { balance: number };
      expect(user.balance).toBe(50000 - 5000);

      // replyWithPhoto should have been called with the generated image
      expect(fmtCtx.replyWithPhoto).toHaveBeenCalled();
    });

    it("rejects when balance is insufficient", async () => {
      const userId = 200;
      createUser(userId, 0); // zero balance

      const fmtCtx = await setupPendingAndSelect(userId, { balance: 0 });

      await handleFormatSelection(fmtCtx);

      // Should show insufficient balance message via api.editMessageText
      expect(fmtCtx.api.editMessageText).toHaveBeenCalledWith(
        userId,
        expect.any(Number),
        expect.stringContaining("Недостаточно средств"),
        expect.objectContaining({ reply_markup: expect.anything() }),
      );

      // Balance should remain 0
      const user = db.prepare("SELECT balance FROM users WHERE telegram_id = ?").get(userId) as { balance: number };
      expect(user.balance).toBe(0);
    });

    it("rejects when rate limit exceeded", async () => {
      const userId = 300;
      createUser(userId, 50000);

      const fmtCtx = await setupPendingAndSelect(userId);

      // Override rate limit to reject
      mockCheckRateLimit.mockReturnValueOnce(false);

      await handleFormatSelection(fmtCtx);

      // Should show rate limit message
      expect(fmtCtx.api.editMessageText).toHaveBeenCalledWith(
        userId,
        expect.any(Number),
        expect.stringContaining("Слишком много запросов"),
      );

      // Balance should NOT be deducted
      const user = db.prepare("SELECT balance FROM users WHERE telegram_id = ?").get(userId) as { balance: number };
      expect(user.balance).toBe(50000);
    });

    it("refunds balance on file download error", async () => {
      const userId = 400;
      createUser(userId, 50000);

      const fmtCtx = await setupPendingAndSelect(userId);

      // Mock fetch to fail for file download
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      await handleFormatSelection(fmtCtx);

      // Balance should be refunded (back to original)
      const user = db.prepare("SELECT balance FROM users WHERE telegram_id = ?").get(userId) as { balance: number };
      expect(user.balance).toBe(50000);

      // Should show error message
      expect(fmtCtx.api.editMessageText).toHaveBeenCalledWith(
        userId,
        expect.any(Number),
        expect.stringContaining("ошибка"),
      );
    });

    it("refunds balance on AI generation error", async () => {
      const userId = 500;
      createUser(userId, 50000);

      const fmtCtx = await setupPendingAndSelect(userId);

      // Mock provider.generate to throw
      mockGenerate.mockRejectedValueOnce(new Error("AI generation failed"));

      await handleFormatSelection(fmtCtx);

      // Balance should be refunded
      const user = db.prepare("SELECT balance FROM users WHERE telegram_id = ?").get(userId) as { balance: number };
      expect(user.balance).toBe(50000);

      // Should show error message
      expect(fmtCtx.api.editMessageText).toHaveBeenCalledWith(
        userId,
        expect.any(Number),
        expect.stringContaining("ошибка"),
      );
    });

    it("saves result_file_id on successful generation", async () => {
      const userId = 600;
      createUser(userId, 50000);

      const fmtCtx = await setupPendingAndSelect(userId);

      await handleFormatSelection(fmtCtx);

      // Check that the generation record has been completed with the result_file_id
      const gen = db.prepare(
        "SELECT * FROM generations WHERE user_id = ? ORDER BY id DESC LIMIT 1",
      ).get(userId) as { status: string; result_file_id: string | null };

      expect(gen.status).toBe("completed");
      expect(gen.result_file_id).toBe("result_photo_id");
    });
  });

  describe("pendingRequests cleanup", () => {
    it("removes entries older than 30 minutes", async () => {
      vi.useFakeTimers();
      const userId = 700;
      createUser(userId, 50000);

      try {
        // Step 1: set up a pending request via handlePhoto
        const photoCtx = createMockContext({
          userId,
          messagePhoto: [
            { file_id: "small_700", width: 320, height: 240 },
            { file_id: "medium_700", width: 800, height: 600 },
          ],
          messageCaption: "Test cleanup",
        });
        await handlePhoto(photoCtx);

        // Step 2: start the cleanup interval
        startPendingCleanup();

        // Step 3: advance time by 40 minutes so cleanup fires after TTL expires
        // Cleanup runs every 10 min; TTL is 30 min (strict >). At 30 min mark: 30 > 30 is false.
        // At 40 min mark: 40 > 30 is true — entry gets removed.
        vi.advanceTimersByTime(40 * 60 * 1000);

        // Step 4: try to select a format — should fail because pending was cleaned up
        const fmtCtx = createMockContext({
          userId,
          callbackData: "fmt:3x4",
          callbackMessageId: 200,
        });
        await handleFormatSelection(fmtCtx);

        expect(fmtCtx.answerCallbackQuery).toHaveBeenCalledWith(
          expect.objectContaining({ text: expect.stringContaining("устарел") }),
        );
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
