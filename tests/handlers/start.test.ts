import { describe, it, expect, vi } from "vitest";
import { createMockContext } from "../helpers/context.js";

vi.mock("../../src/config.js", () => ({
  config: {
    adminIds: [111],
  },
}));

const { handleStart } = await import("../../src/handlers/start.js");

describe("handlers/start", () => {
  it("sends welcome message with keyboard", async () => {
    const ctx = createMockContext({ userId: 12345 });
    await handleStart(ctx);

    expect(ctx.reply).toHaveBeenCalledTimes(1);
    const [text, opts] = (ctx.reply as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(text).toContain("генерации карточки");
    expect(opts.reply_markup).toBeDefined();
  });

  it("shows admin button for admin users", async () => {
    const ctx = createMockContext({ userId: 111 }); // admin
    await handleStart(ctx);

    const [, opts] = (ctx.reply as ReturnType<typeof vi.fn>).mock.calls[0];
    const buttons = opts.reply_markup.inline_keyboard.flat();
    const callbacks = buttons.map((b: { callback_data?: string }) => b.callback_data);
    expect(callbacks).toContain("admin:open");
  });

  it("hides admin button for regular users", async () => {
    const ctx = createMockContext({ userId: 12345 }); // not admin
    await handleStart(ctx);

    const [, opts] = (ctx.reply as ReturnType<typeof vi.fn>).mock.calls[0];
    const buttons = opts.reply_markup.inline_keyboard.flat();
    const callbacks = buttons.map((b: { callback_data?: string }) => b.callback_data);
    expect(callbacks).not.toContain("admin:open");
  });
});
