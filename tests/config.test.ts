import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("dotenv/config", () => ({}));

// Save original env to restore after each test
const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  vi.resetModules();
});

describe("config", () => {
  describe("requireEnv", () => {
    it("throws error when BOT_TOKEN is missing", async () => {
      vi.resetModules();
      delete process.env.BOT_TOKEN;
      process.env.OPENROUTER_API_KEY = "test-key";

      await expect(
        import("../src/config.js")
      ).rejects.toThrow("Missing required environment variable: BOT_TOKEN");
    });

    it("throws error when OPENROUTER_API_KEY is missing", async () => {
      vi.resetModules();
      process.env.BOT_TOKEN = "test-token";
      delete process.env.OPENROUTER_API_KEY;

      await expect(
        import("../src/config.js")
      ).rejects.toThrow(
        "Missing required environment variable: OPENROUTER_API_KEY"
      );
    });
  });

  describe("ADMIN_IDS", () => {
    it("parses valid comma-separated IDs", async () => {
      vi.resetModules();
      process.env.BOT_TOKEN = "test-token";
      process.env.OPENROUTER_API_KEY = "test-key";
      process.env.ADMIN_IDS = "111,222,333";

      const { config } = await import("../src/config.js");
      expect(config.adminIds).toEqual([111, 222, 333]);
    });

    it("returns empty array for empty string", async () => {
      vi.resetModules();
      process.env.BOT_TOKEN = "test-token";
      process.env.OPENROUTER_API_KEY = "test-key";
      process.env.ADMIN_IDS = "";

      const { config } = await import("../src/config.js");
      expect(config.adminIds).toEqual([]);
    });

    it("trims spaces around IDs", async () => {
      vi.resetModules();
      process.env.BOT_TOKEN = "test-token";
      process.env.OPENROUTER_API_KEY = "test-key";
      process.env.ADMIN_IDS = " 111 , 222 , 333 ";

      const { config } = await import("../src/config.js");
      expect(config.adminIds).toEqual([111, 222, 333]);
    });

    it("filters out non-numeric values", async () => {
      vi.resetModules();
      process.env.BOT_TOKEN = "test-token";
      process.env.OPENROUTER_API_KEY = "test-key";
      process.env.ADMIN_IDS = "111,abc,222,def";

      const { config } = await import("../src/config.js");
      expect(config.adminIds).toEqual([111, 222]);
    });

    it("filters out zero and negative numbers", async () => {
      vi.resetModules();
      process.env.BOT_TOKEN = "test-token";
      process.env.OPENROUTER_API_KEY = "test-key";
      process.env.ADMIN_IDS = "111,0,-5,222";

      const { config } = await import("../src/config.js");
      expect(config.adminIds).toEqual([111, 222]);
    });
  });

  describe("webhookPort", () => {
    it("defaults to 3000 when not set", async () => {
      vi.resetModules();
      process.env.BOT_TOKEN = "test-token";
      process.env.OPENROUTER_API_KEY = "test-key";
      delete process.env.WEBHOOK_PORT;

      const { config } = await import("../src/config.js");
      expect(config.webhookPort).toBe(3000);
    });

    it("takes value from env", async () => {
      vi.resetModules();
      process.env.BOT_TOKEN = "test-token";
      process.env.OPENROUTER_API_KEY = "test-key";
      process.env.WEBHOOK_PORT = "8080";

      const { config } = await import("../src/config.js");
      expect(config.webhookPort).toBe(8080);
    });
  });

  describe("yoomoney", () => {
    it("all fields default to empty strings", async () => {
      vi.resetModules();
      process.env.BOT_TOKEN = "test-token";
      process.env.OPENROUTER_API_KEY = "test-key";
      delete process.env.YOOMONEY_WALLET_ID;
      delete process.env.YOOMONEY_NOTIFICATION_SECRET;
      delete process.env.PAYMENT_RETURN_URL;

      const { config } = await import("../src/config.js");
      expect(config.yoomoney.walletId).toBe("");
      expect(config.yoomoney.notificationSecret).toBe("");
      expect(config.yoomoney.returnUrl).toBe("");
    });
  });
});
