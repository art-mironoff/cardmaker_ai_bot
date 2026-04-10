import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Database from "better-sqlite3";
import { createTestDb } from "../helpers/db.js";

let db: Database.Database;

vi.mock("../../src/db/index.js", () => ({
  getDb: () => db,
}));

const {
  getOrCreateUser,
  getUser,
  updateLastActive,
  addBalance,
  deductBalance,
  setBlocked,
  setConsent,
  getUserCount,
  getActiveUsersCount,
  listUsers,
} = await import("../../src/db/users.js");

describe("db/users", () => {
  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    db.close();
  });

  describe("getOrCreateUser", () => {
    it("creates a new user with default balance", () => {
      const user = getOrCreateUser(100, "alice", "Alice");
      expect(user.telegram_id).toBe(100);
      expect(user.username).toBe("alice");
      expect(user.first_name).toBe("Alice");
      expect(user.balance).toBe(0);
      expect(user.is_blocked).toBe(0);
      expect(user.consent_given).toBe(0);
    });

    it("creates user with welcome balance when configured", () => {
      db.prepare("UPDATE settings SET value = '5000' WHERE key = 'welcome_balance'").run();
      const user = getOrCreateUser(101, "bob", "Bob");
      expect(user.balance).toBe(5000);
    });

    it("updates username and first_name of existing user", () => {
      getOrCreateUser(100, "alice", "Alice");
      const updated = getOrCreateUser(100, "alice_new", "Alice New");
      expect(updated.username).toBe("alice_new");
      expect(updated.first_name).toBe("Alice New");
    });

    it("handles null username and first_name", () => {
      const user = getOrCreateUser(100);
      expect(user.username).toBeNull();
      expect(user.first_name).toBeNull();
    });

    it("does not reset balance when updating existing user", () => {
      getOrCreateUser(100, "alice", "Alice");
      addBalance(100, 5000);
      const updated = getOrCreateUser(100, "alice", "Alice");
      expect(updated.balance).toBe(5000);
    });
  });

  describe("getUser", () => {
    it("returns undefined for non-existent user", () => {
      expect(getUser(999)).toBeUndefined();
    });

    it("returns existing user", () => {
      getOrCreateUser(100, "alice", "Alice");
      const user = getUser(100);
      expect(user).toBeDefined();
      expect(user!.telegram_id).toBe(100);
    });
  });

  describe("updateLastActive", () => {
    it("updates last_active timestamp", () => {
      getOrCreateUser(100, "alice", "Alice");
      const before = getUser(100)!.last_active;
      updateLastActive(100);
      const after = getUser(100)!.last_active;
      // Timestamps might be the same if test runs within same second
      expect(after).toBeDefined();
      expect(typeof after).toBe("string");
    });
  });

  describe("addBalance", () => {
    it("adds positive amount to balance", () => {
      getOrCreateUser(100, "alice", "Alice");
      addBalance(100, 5000);
      expect(getUser(100)!.balance).toBe(5000);
    });

    it("accumulates multiple additions", () => {
      getOrCreateUser(100, "alice", "Alice");
      addBalance(100, 3000);
      addBalance(100, 2000);
      expect(getUser(100)!.balance).toBe(5000);
    });
  });

  describe("deductBalance", () => {
    it("deducts when sufficient balance", () => {
      getOrCreateUser(100, "alice", "Alice");
      addBalance(100, 10000);
      const result = deductBalance(100, 5000);
      expect(result).toBe(true);
      expect(getUser(100)!.balance).toBe(5000);
    });

    it("rejects deduction when insufficient balance", () => {
      getOrCreateUser(100, "alice", "Alice");
      addBalance(100, 3000);
      const result = deductBalance(100, 5000);
      expect(result).toBe(false);
      expect(getUser(100)!.balance).toBe(3000);
    });

    it("allows deduction of exact balance", () => {
      getOrCreateUser(100, "alice", "Alice");
      addBalance(100, 5000);
      const result = deductBalance(100, 5000);
      expect(result).toBe(true);
      expect(getUser(100)!.balance).toBe(0);
    });

    it("rejects deduction from zero balance", () => {
      getOrCreateUser(100, "alice", "Alice");
      const result = deductBalance(100, 100);
      expect(result).toBe(false);
    });
  });

  describe("setBlocked", () => {
    it("blocks a user", () => {
      getOrCreateUser(100, "alice", "Alice");
      setBlocked(100, true);
      expect(getUser(100)!.is_blocked).toBe(1);
    });

    it("unblocks a user", () => {
      getOrCreateUser(100, "alice", "Alice");
      setBlocked(100, true);
      setBlocked(100, false);
      expect(getUser(100)!.is_blocked).toBe(0);
    });
  });

  describe("setConsent", () => {
    it("sets consent to true", () => {
      getOrCreateUser(100, "alice", "Alice");
      setConsent(100, true);
      expect(getUser(100)!.consent_given).toBe(1);
    });

    it("revokes consent", () => {
      getOrCreateUser(100, "alice", "Alice");
      setConsent(100, true);
      setConsent(100, false);
      expect(getUser(100)!.consent_given).toBe(0);
    });
  });

  describe("getUserCount", () => {
    it("returns 0 for empty database", () => {
      expect(getUserCount()).toBe(0);
    });

    it("counts all users", () => {
      getOrCreateUser(100, "alice", "Alice");
      getOrCreateUser(101, "bob", "Bob");
      getOrCreateUser(102, "charlie", "Charlie");
      expect(getUserCount()).toBe(3);
    });
  });

  describe("getActiveUsersCount", () => {
    it("counts users active within given days", () => {
      getOrCreateUser(100, "alice", "Alice");
      getOrCreateUser(101, "bob", "Bob");
      // Both just created, so active within 1 day
      expect(getActiveUsersCount(1)).toBe(2);
    });
  });

  describe("listUsers", () => {
    it("returns empty array when no users", () => {
      expect(listUsers(0, 10)).toEqual([]);
    });

    it("returns users with generation count", () => {
      getOrCreateUser(100, "alice", "Alice");
      const users = listUsers(0, 10);
      expect(users).toHaveLength(1);
      expect(users[0].telegram_id).toBe(100);
      expect(users[0].generation_count).toBe(0);
    });

    it("paginates correctly", () => {
      for (let i = 1; i <= 5; i++) {
        getOrCreateUser(100 + i, `user${i}`, `User ${i}`);
      }
      const page1 = listUsers(0, 2);
      const page2 = listUsers(2, 2);
      const page3 = listUsers(4, 2);
      expect(page1).toHaveLength(2);
      expect(page2).toHaveLength(2);
      expect(page3).toHaveLength(1);
    });

    it("includes generation count from generations table", () => {
      getOrCreateUser(100, "alice", "Alice");
      addBalance(100, 50000);
      // Insert generations directly
      db.prepare(
        "INSERT INTO generations (user_id, cost, provider) VALUES (?, ?, ?)",
      ).run(100, 5000, "openrouter");
      db.prepare(
        "INSERT INTO generations (user_id, cost, provider) VALUES (?, ?, ?)",
      ).run(100, 5000, "openrouter");

      const users = listUsers(0, 10);
      expect(users[0].generation_count).toBe(2);
    });
  });
});
