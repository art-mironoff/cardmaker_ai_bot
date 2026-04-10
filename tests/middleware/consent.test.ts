import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Database from "better-sqlite3";
import { createTestDb } from "../helpers/db.js";
import { createMockContext } from "../helpers/context.js";

let db: Database.Database;

vi.mock("../../src/db/index.js", () => ({
  getDb: () => db,
}));

const { consent, getConsentCallback, handleConsentAccept } =
  await import("../../src/middleware/consent.js");
const { getUser } = await import("../../src/db/users.js");

describe("middleware/consent", () => {
  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    db.close();
  });

  it("passes through when consent is not required", async () => {
    // Default: require_consent = false
    const ctx = createMockContext({ consentGiven: 0 });
    const next = vi.fn();

    await consent(ctx, next);

    expect(next).toHaveBeenCalled();
    expect(ctx.reply).not.toHaveBeenCalled();
  });

  it("passes through when user already gave consent", async () => {
    db.prepare("UPDATE settings SET value = 'true' WHERE key = 'require_consent'").run();
    const ctx = createMockContext({ consentGiven: 1 });
    const next = vi.fn();

    await consent(ctx, next);

    expect(next).toHaveBeenCalled();
  });

  it("shows consent prompt when required and not given", async () => {
    db.prepare("UPDATE settings SET value = 'true' WHERE key = 'require_consent'").run();
    const ctx = createMockContext({ consentGiven: 0, messageText: "/start" });
    const next = vi.fn();

    await consent(ctx, next);

    expect(next).not.toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalled();
    const replyArgs = (ctx.reply as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(replyArgs[0]).toContain("согласие на обработку персональных данных");
  });

  it("allows consent callback to pass through", async () => {
    db.prepare("UPDATE settings SET value = 'true' WHERE key = 'require_consent'").run();
    const ctx = createMockContext({
      consentGiven: 0,
      callbackData: getConsentCallback(),
      callbackMessageId: 1,
    });
    const next = vi.fn();

    await consent(ctx, next);

    expect(next).toHaveBeenCalled();
  });

  it("passes through when dbUser is undefined", async () => {
    db.prepare("UPDATE settings SET value = 'true' WHERE key = 'require_consent'").run();
    const ctx = createMockContext();
    (ctx as Record<string, unknown>).dbUser = undefined;
    const next = vi.fn();

    await consent(ctx, next);

    expect(next).toHaveBeenCalled();
  });

  describe("getConsentCallback", () => {
    it("returns consent callback string", () => {
      expect(getConsentCallback()).toBe("consent:accept");
    });
  });

  describe("handleConsentAccept", () => {
    it("sets consent in DB and updates context", async () => {
      // Create user first
      db.prepare("INSERT INTO users (telegram_id, username, first_name) VALUES (?, ?, ?)").run(100, "alice", "Alice");

      const ctx = createMockContext({ userId: 100, consentGiven: 0 });

      await handleConsentAccept(ctx);

      // Check DB
      const user = getUser(100);
      expect(user!.consent_given).toBe(1);

      // Check context was updated
      expect(ctx.dbUser.consent_given).toBe(1);

      // Check user was notified
      expect(ctx.answerCallbackQuery).toHaveBeenCalledWith({ text: "Спасибо!" });
      expect(ctx.editMessageText).toHaveBeenCalled();
    });

    it("does nothing when ctx.from is missing", async () => {
      const ctx = createMockContext();
      (ctx as Record<string, unknown>).from = undefined;

      await handleConsentAccept(ctx);

      expect(ctx.answerCallbackQuery).not.toHaveBeenCalled();
    });
  });
});
