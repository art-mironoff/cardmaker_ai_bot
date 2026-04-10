import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Database from "better-sqlite3";
import { createTestDb } from "../helpers/db.js";

let db: Database.Database;

vi.mock("../../src/db/index.js", () => ({
  getDb: () => db,
}));

const { getSetting, setSetting, getGenerationPrice, getWelcomeBalance, isConsentRequired } =
  await import("../../src/db/settings.js");

describe("db/settings", () => {
  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    db.close();
  });

  describe("getSetting", () => {
    it("returns default generation_price", () => {
      expect(getSetting("generation_price")).toBe("5000");
    });

    it("returns default welcome_balance", () => {
      expect(getSetting("welcome_balance")).toBe("0");
    });

    it("returns default require_consent", () => {
      expect(getSetting("require_consent")).toBe("false");
    });

    it("returns null for non-existent key", () => {
      expect(getSetting("nonexistent")).toBeNull();
    });
  });

  describe("setSetting", () => {
    it("updates existing setting", () => {
      setSetting("generation_price", "10000");
      expect(getSetting("generation_price")).toBe("10000");
    });

    it("creates new setting via upsert", () => {
      setSetting("custom_key", "custom_value");
      expect(getSetting("custom_key")).toBe("custom_value");
    });

    it("overwrites setting on repeated set", () => {
      setSetting("generation_price", "1000");
      setSetting("generation_price", "2000");
      expect(getSetting("generation_price")).toBe("2000");
    });
  });

  describe("getGenerationPrice", () => {
    it("returns default price in kopecks", () => {
      expect(getGenerationPrice()).toBe(5000);
    });

    it("returns updated price", () => {
      setSetting("generation_price", "7500");
      expect(getGenerationPrice()).toBe(7500);
    });
  });

  describe("getWelcomeBalance", () => {
    it("returns default 0", () => {
      expect(getWelcomeBalance()).toBe(0);
    });

    it("returns updated welcome balance", () => {
      setSetting("welcome_balance", "5000");
      expect(getWelcomeBalance()).toBe(5000);
    });
  });

  describe("isConsentRequired", () => {
    it("returns false by default", () => {
      expect(isConsentRequired()).toBe(false);
    });

    it("returns true when set to 'true'", () => {
      setSetting("require_consent", "true");
      expect(isConsentRequired()).toBe(true);
    });

    it("returns false for any non-'true' value", () => {
      setSetting("require_consent", "yes");
      expect(isConsentRequired()).toBe(false);
    });
  });
});
