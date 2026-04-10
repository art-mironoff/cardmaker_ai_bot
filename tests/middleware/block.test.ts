import { describe, it, expect, vi } from "vitest";
import { createMockContext } from "../helpers/context.js";

const { block } = await import("../../src/middleware/block.js");

describe("middleware/block", () => {
  it("blocks user and replies with message", async () => {
    const ctx = createMockContext({ isBlocked: 1 });
    const next = vi.fn();

    await block(ctx, next);

    expect(ctx.reply).toHaveBeenCalledWith("Ваш аккаунт заблокирован.");
    expect(next).not.toHaveBeenCalled();
  });

  it("blocks user and answers callback query", async () => {
    const ctx = createMockContext({
      isBlocked: 1,
      callbackData: "some:action",
      callbackMessageId: 1,
    });
    const next = vi.fn();

    await block(ctx, next);

    expect(ctx.answerCallbackQuery).toHaveBeenCalledWith({ text: "Ваш аккаунт заблокирован." });
    expect(next).not.toHaveBeenCalled();
  });

  it("allows unblocked user to proceed", async () => {
    const ctx = createMockContext({ isBlocked: 0 });
    const next = vi.fn();

    await block(ctx, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(ctx.reply).not.toHaveBeenCalled();
  });

  it("allows user when dbUser is undefined", async () => {
    const ctx = createMockContext();
    (ctx as Record<string, unknown>).dbUser = undefined;
    const next = vi.fn();

    await block(ctx, next);

    expect(next).toHaveBeenCalledTimes(1);
  });
});
