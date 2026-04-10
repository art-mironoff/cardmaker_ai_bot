import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Database from "better-sqlite3";
import { createTestDb } from "../helpers/db.js";

let db: Database.Database;

vi.mock("../../src/db/index.js", () => ({
  getDb: () => db,
}));

const {
  createGeneration,
  completeGeneration,
  failGeneration,
  getGeneration,
  getRecentGenerations,
  getGenerationCount,
  getUserGenerationCount,
  getGenerationStats,
} = await import("../../src/db/generations.js");

// Need a user to satisfy foreign key constraint
function createUser(telegramId: number): void {
  db.prepare(
    "INSERT INTO users (telegram_id, username, first_name, balance) VALUES (?, ?, ?, ?)",
  ).run(telegramId, "user" + telegramId, "User", 50000);
}

describe("db/generations", () => {
  beforeEach(() => {
    db = createTestDb();
    createUser(100);
    createUser(101);
  });

  afterEach(() => {
    db.close();
  });

  describe("createGeneration", () => {
    it("creates a generation and returns its id", () => {
      const id = createGeneration(100, 5000, "openrouter", "3x4", "Test prompt", "source_123");
      expect(id).toBeGreaterThan(0);
    });

    it("creates generation with pending status by default", () => {
      const id = createGeneration(100, 5000, "openrouter", "3x4", "Test", null);
      const gen = getGeneration(id);
      expect(gen!.status).toBe("pending");
    });

    it("stores all fields correctly", () => {
      const id = createGeneration(100, 5000, "openrouter", "1x1", "My prompt", "src_file");
      const gen = getGeneration(id);
      expect(gen).toMatchObject({
        user_id: 100,
        cost: 5000,
        provider: "openrouter",
        format: "1x1",
        user_prompt: "My prompt",
        source_file_id: "src_file",
        result_file_id: null,
        actual_cost: null,
      });
    });

    it("handles null optional fields", () => {
      const id = createGeneration(100, 5000, "openrouter", null, null, null);
      const gen = getGeneration(id);
      expect(gen!.format).toBeNull();
      expect(gen!.user_prompt).toBeNull();
      expect(gen!.source_file_id).toBeNull();
    });

    it("auto-increments ids", () => {
      const id1 = createGeneration(100, 5000, "openrouter", "3x4", "A", null);
      const id2 = createGeneration(100, 5000, "openrouter", "3x4", "B", null);
      expect(id2).toBe(id1 + 1);
    });
  });

  describe("completeGeneration", () => {
    it("sets status to completed", () => {
      const id = createGeneration(100, 5000, "openrouter", "3x4", "Test", null);
      completeGeneration(id, "result_file_123");
      const gen = getGeneration(id);
      expect(gen!.status).toBe("completed");
      expect(gen!.result_file_id).toBe("result_file_123");
    });

    it("stores actual_cost when provided", () => {
      const id = createGeneration(100, 5000, "openrouter", "3x4", "Test", null);
      completeGeneration(id, "result_file", 3500);
      const gen = getGeneration(id);
      expect(gen!.actual_cost).toBe(3500);
    });

    it("handles undefined result_file_id and actual_cost", () => {
      const id = createGeneration(100, 5000, "openrouter", "3x4", "Test", null);
      completeGeneration(id);
      const gen = getGeneration(id);
      expect(gen!.status).toBe("completed");
      expect(gen!.result_file_id).toBeNull();
      expect(gen!.actual_cost).toBeNull();
    });
  });

  describe("failGeneration", () => {
    it("sets status to failed", () => {
      const id = createGeneration(100, 5000, "openrouter", "3x4", "Test", null);
      failGeneration(id);
      const gen = getGeneration(id);
      expect(gen!.status).toBe("failed");
    });
  });

  describe("getGeneration", () => {
    it("returns null for non-existent id", () => {
      expect(getGeneration(999)).toBeNull();
    });

    it("returns generation by id", () => {
      const id = createGeneration(100, 5000, "openrouter", "3x4", "Test", null);
      const gen = getGeneration(id);
      expect(gen).not.toBeNull();
      expect(gen!.id).toBe(id);
    });
  });

  describe("getRecentGenerations", () => {
    it("returns empty array when no generations", () => {
      expect(getRecentGenerations(10)).toEqual([]);
    });

    it("returns generations with username", () => {
      createGeneration(100, 5000, "openrouter", "3x4", "Test", null);
      const recent = getRecentGenerations(10);
      expect(recent).toHaveLength(1);
      expect(recent[0].username).toBe("user100");
    });

    it("respects limit and offset", () => {
      for (let i = 0; i < 5; i++) {
        createGeneration(100, 5000, "openrouter", "3x4", `Prompt ${i}`, null);
      }
      const page1 = getRecentGenerations(2, 0);
      const page2 = getRecentGenerations(2, 2);
      expect(page1).toHaveLength(2);
      expect(page2).toHaveLength(2);
    });

    it("orders by created_at DESC", () => {
      const id1 = createGeneration(100, 5000, "openrouter", "3x4", "First", null);
      const id2 = createGeneration(100, 5000, "openrouter", "3x4", "Second", null);
      const recent = getRecentGenerations(10);
      expect(recent[0].id).toBe(id2);
      expect(recent[1].id).toBe(id1);
    });
  });

  describe("getGenerationCount", () => {
    it("returns 0 when no generations", () => {
      expect(getGenerationCount()).toBe(0);
    });

    it("counts all generations", () => {
      createGeneration(100, 5000, "openrouter", "3x4", "A", null);
      createGeneration(100, 5000, "openrouter", "3x4", "B", null);
      createGeneration(101, 5000, "openrouter", "3x4", "C", null);
      expect(getGenerationCount()).toBe(3);
    });
  });

  describe("getUserGenerationCount", () => {
    it("returns 0 for user with no generations", () => {
      expect(getUserGenerationCount(100)).toBe(0);
    });

    it("counts only the specified user's generations", () => {
      createGeneration(100, 5000, "openrouter", "3x4", "A", null);
      createGeneration(100, 5000, "openrouter", "3x4", "B", null);
      createGeneration(101, 5000, "openrouter", "3x4", "C", null);
      expect(getUserGenerationCount(100)).toBe(2);
      expect(getUserGenerationCount(101)).toBe(1);
    });
  });

  describe("getGenerationStats", () => {
    it("returns zeroes when no generations", () => {
      const stats = getGenerationStats();
      expect(stats.total).toBe(0);
      expect(stats.today).toBe(0);
      expect(stats.week).toBe(0);
      expect(stats.revenue).toBe(0);
      expect(stats.revenue_today).toBe(0);
      expect(stats.revenue_week).toBe(0);
      expect(stats.actual_cost_total).toBe(0);
    });

    it("counts only completed generations", () => {
      const id1 = createGeneration(100, 5000, "openrouter", "3x4", "A", null);
      const id2 = createGeneration(100, 3000, "openrouter", "3x4", "B", null);
      const id3 = createGeneration(100, 5000, "openrouter", "3x4", "C", null);
      completeGeneration(id1, "file1", 2000);
      completeGeneration(id2, "file2", 1500);
      failGeneration(id3);

      const stats = getGenerationStats();
      expect(stats.total).toBe(2);
      expect(stats.revenue).toBe(8000);
      expect(stats.actual_cost_total).toBe(3500);
    });

    it("counts today and week stats correctly", () => {
      const id = createGeneration(100, 5000, "openrouter", "3x4", "A", null);
      completeGeneration(id, "file1");
      const stats = getGenerationStats();
      // Just created, so counts as today and this week
      expect(stats.today).toBe(1);
      expect(stats.week).toBe(1);
    });
  });
});
