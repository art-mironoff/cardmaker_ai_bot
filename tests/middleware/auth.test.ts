import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Database from "better-sqlite3";
import { createTestDb } from "../helpers/db.js";
import { createMockContext } from "../helpers/context.js";

let db: Database.Database;

vi.mock("../../src/db/index.js", () => ({
  getDb: () => db,
}));

const { auth } = await import("../../src/middleware/auth.js");
const { getUser } = await import("../../src/db/users.js");

describe("middleware/auth", () => {
  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    db.close();
  });

  it("creates new user on first interaction", async () => {
    const ctx = createMockContext({ userId: 100, username: "alice", firstName: "Alice" });
    const next = vi.fn();

    await auth(ctx, next);

    const user = getUser(100);
    expect(user).toBeDefined();
    expect(user!.username).toBe("alice");
    expect(user!.first_name).toBe("Alice");
    expect(next).toHaveBeenCalled();
  });

  it("sets ctx.dbUser for new user", async () => {
    const ctx = createMockContext({ userId: 100, username: "alice", firstName: "Alice" });
    const next = vi.fn();

    await auth(ctx, next);

    expect(ctx.dbUser).toBeDefined();
    expect(ctx.dbUser.telegram_id).toBe(100);
  });

  it("updates existing user's username and first_name", async () => {
    // Create user first
    db.prepare("INSERT INTO users (telegram_id, username, first_name) VALUES (?, ?, ?)").run(100, "old_name", "Old");

    const ctx = createMockContext({ userId: 100, username: "new_name", firstName: "New" });
    const next = vi.fn();

    await auth(ctx, next);

    const user = getUser(100);
    expect(user!.username).toBe("new_name");
    expect(user!.first_name).toBe("New");
  });

  it("calls next middleware", async () => {
    const ctx = createMockContext({ userId: 100 });
    const next = vi.fn();

    await auth(ctx, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it("does nothing when ctx.from is missing", async () => {
    const ctx = createMockContext();
    (ctx as Record<string, unknown>).from = undefined;
    const next = vi.fn();

    await auth(ctx, next);

    expect(next).not.toHaveBeenCalled();
    expect(getUser(12345)).toBeUndefined();
  });
});
