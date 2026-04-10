import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Database from "better-sqlite3";
import { createTestDb } from "../helpers/db.js";

let db: Database.Database;

vi.mock("../../src/db/index.js", () => ({
  getDb: () => db,
}));

const {
  createPayment,
  updatePaymentStatus,
  claimAndCreditPayment,
  getPaymentByExternalId,
  getPaymentById,
  getRecentPayments,
  getPaymentCount,
  getPaymentStats,
} = await import("../../src/db/payments.js");

function createUser(telegramId: number, balance = 0): void {
  db.prepare(
    "INSERT INTO users (telegram_id, username, first_name, balance) VALUES (?, ?, ?, ?)",
  ).run(telegramId, "user" + telegramId, "User", balance);
}

describe("db/payments", () => {
  beforeEach(() => {
    db = createTestDb();
    createUser(100);
    createUser(101);
  });

  afterEach(() => {
    db.close();
  });

  describe("createPayment", () => {
    it("creates a payment and returns its id", () => {
      const id = createPayment(100, 5000);
      expect(id).toBeGreaterThan(0);
    });

    it("creates payment with pending status", () => {
      const id = createPayment(100, 5000);
      const payment = getPaymentById(id);
      expect(payment!.status).toBe("pending");
    });

    it("stores amount correctly", () => {
      const id = createPayment(100, 10000);
      const payment = getPaymentById(id);
      expect(payment!.amount).toBe(10000);
      expect(payment!.user_id).toBe(100);
    });

    it("auto-increments ids", () => {
      const id1 = createPayment(100, 5000);
      const id2 = createPayment(100, 10000);
      expect(id2).toBe(id1 + 1);
    });
  });

  describe("updatePaymentStatus", () => {
    it("updates status", () => {
      const id = createPayment(100, 5000);
      updatePaymentStatus(id, "succeeded");
      expect(getPaymentById(id)!.status).toBe("succeeded");
    });

    it("sets external_id when provided", () => {
      const id = createPayment(100, 5000);
      updatePaymentStatus(id, "pending", "ext_123");
      expect(getPaymentById(id)!.external_id).toBe("ext_123");
    });

    it("sets confirmation_url when provided", () => {
      const id = createPayment(100, 5000);
      updatePaymentStatus(id, "pending", undefined, "https://pay.example.com");
      expect(getPaymentById(id)!.confirmation_url).toBe("https://pay.example.com");
    });

    it("preserves existing external_id when not provided (COALESCE)", () => {
      const id = createPayment(100, 5000);
      updatePaymentStatus(id, "pending", "ext_123");
      updatePaymentStatus(id, "succeeded");
      expect(getPaymentById(id)!.external_id).toBe("ext_123");
    });

    it("preserves existing confirmation_url when not provided (COALESCE)", () => {
      const id = createPayment(100, 5000);
      updatePaymentStatus(id, "pending", undefined, "https://pay.example.com");
      updatePaymentStatus(id, "succeeded");
      expect(getPaymentById(id)!.confirmation_url).toBe("https://pay.example.com");
    });
  });

  describe("claimAndCreditPayment", () => {
    it("claims pending payment and credits user balance", () => {
      const id = createPayment(100, 5000);
      const result = claimAndCreditPayment(id, 100, 5000);
      expect(result).toBe(true);
      expect(getPaymentById(id)!.status).toBe("succeeded");
      // Check user balance was credited
      const user = db.prepare("SELECT balance FROM users WHERE telegram_id = ?").get(100) as { balance: number };
      expect(user.balance).toBe(5000);
    });

    it("rejects already claimed payment (idempotent)", () => {
      const id = createPayment(100, 5000);
      claimAndCreditPayment(id, 100, 5000);
      // Second attempt should fail
      const result = claimAndCreditPayment(id, 100, 5000);
      expect(result).toBe(false);
      // Balance should not be double-credited
      const user = db.prepare("SELECT balance FROM users WHERE telegram_id = ?").get(100) as { balance: number };
      expect(user.balance).toBe(5000);
    });

    it("rejects non-pending payment", () => {
      const id = createPayment(100, 5000);
      updatePaymentStatus(id, "canceled");
      const result = claimAndCreditPayment(id, 100, 5000);
      expect(result).toBe(false);
    });

    it("atomically updates payment and user balance", () => {
      const id = createPayment(100, 10000);
      createUser(102, 3000);
      const id2 = createPayment(102, 5000);

      claimAndCreditPayment(id, 100, 10000);
      claimAndCreditPayment(id2, 102, 5000);

      const user100 = db.prepare("SELECT balance FROM users WHERE telegram_id = ?").get(100) as { balance: number };
      const user102 = db.prepare("SELECT balance FROM users WHERE telegram_id = ?").get(102) as { balance: number };
      expect(user100.balance).toBe(10000);
      expect(user102.balance).toBe(8000); // 3000 initial + 5000 payment
    });
  });

  describe("getPaymentByExternalId", () => {
    it("returns undefined for non-existent external_id", () => {
      expect(getPaymentByExternalId("nonexistent")).toBeUndefined();
    });

    it("finds payment by external_id", () => {
      const id = createPayment(100, 5000);
      updatePaymentStatus(id, "pending", "ext_abc");
      const payment = getPaymentByExternalId("ext_abc");
      expect(payment).toBeDefined();
      expect(payment!.id).toBe(id);
    });
  });

  describe("getPaymentById", () => {
    it("returns undefined for non-existent id", () => {
      expect(getPaymentById(999)).toBeUndefined();
    });

    it("returns payment by id", () => {
      const id = createPayment(100, 5000);
      const payment = getPaymentById(id);
      expect(payment).toBeDefined();
      expect(payment!.id).toBe(id);
    });
  });

  describe("getRecentPayments", () => {
    it("returns empty array when no payments", () => {
      expect(getRecentPayments(10)).toEqual([]);
    });

    it("returns payments with username", () => {
      createPayment(100, 5000);
      const recent = getRecentPayments(10);
      expect(recent).toHaveLength(1);
      expect(recent[0].username).toBe("user100");
    });

    it("paginates correctly", () => {
      for (let i = 0; i < 5; i++) {
        createPayment(100, 5000 + i * 100);
      }
      const page1 = getRecentPayments(2, 0);
      const page2 = getRecentPayments(2, 2);
      expect(page1).toHaveLength(2);
      expect(page2).toHaveLength(2);
    });
  });

  describe("getPaymentCount", () => {
    it("returns 0 when no payments", () => {
      expect(getPaymentCount()).toBe(0);
    });

    it("counts all payments", () => {
      createPayment(100, 5000);
      createPayment(100, 10000);
      createPayment(101, 5000);
      expect(getPaymentCount()).toBe(3);
    });
  });

  describe("getPaymentStats", () => {
    it("returns zeroes when no payments", () => {
      const stats = getPaymentStats();
      expect(stats.total_revenue).toBe(0);
      expect(stats.total_count).toBe(0);
      expect(stats.today_revenue).toBe(0);
      expect(stats.today_count).toBe(0);
    });

    it("counts only succeeded payments", () => {
      const id1 = createPayment(100, 5000);
      const id2 = createPayment(100, 10000);
      const id3 = createPayment(100, 3000);
      claimAndCreditPayment(id1, 100, 5000);
      claimAndCreditPayment(id2, 100, 10000);
      // id3 stays pending

      const stats = getPaymentStats();
      expect(stats.total_count).toBe(2);
      expect(stats.total_revenue).toBe(15000);
    });

    it("counts today's payments", () => {
      const id = createPayment(100, 5000);
      claimAndCreditPayment(id, 100, 5000);
      const stats = getPaymentStats();
      expect(stats.today_count).toBe(1);
      expect(stats.today_revenue).toBe(5000);
    });
  });
});
