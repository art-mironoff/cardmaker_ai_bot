import { describe, it, expect } from "vitest";
import { formatDateMoscow, texts } from "../src/texts/index.js";

describe("texts/index", () => {
  describe("formatDateMoscow", () => {
    it("formats UTC date string to Moscow timezone", () => {
      const result = formatDateMoscow("2024-06-15 12:00:00");
      // Moscow is UTC+3, so 12:00 UTC = 15:00 Moscow
      expect(result).toContain("15:00:00");
      expect(result).toContain("15.06.2024");
    });

    it("handles midnight UTC correctly", () => {
      const result = formatDateMoscow("2024-01-01 00:00:00");
      // 00:00 UTC = 03:00 Moscow
      expect(result).toContain("03:00:00");
    });

    it("handles date near day boundary in Moscow", () => {
      // 21:30 UTC = 00:30 next day in Moscow
      const result = formatDateMoscow("2024-06-15 21:30:00");
      expect(result).toContain("16.06.2024");
      expect(result).toContain("00:30:00");
    });
  });

  describe("template functions", () => {
    it("balance() formats amount in rubles", () => {
      const result = texts.balance(100);
      expect(result).toContain("100");
      expect(result).toContain("₽");
    });

    it("tariffs() includes price", () => {
      const result = texts.tariffs(50);
      expect(result).toContain("50");
    });

    it("insufficientBalance() shows balance and price", () => {
      const result = texts.insufficientBalance(10, 50);
      expect(result).toContain("10");
      expect(result).toContain("50");
    });

    it("paymentCreated() includes amount", () => {
      const result = texts.paymentCreated(100, "https://pay.example.com");
      expect(result).toContain("100");
    });

    it("paymentSuccess() shows amount and new balance", () => {
      const result = texts.paymentSuccess(100, 200);
      expect(result).toContain("100");
      expect(result).toContain("200");
    });

    it("providerSwitched() includes provider name", () => {
      expect(texts.providerSwitched("openai")).toContain("openai");
    });

    it("providerCurrent() includes provider name", () => {
      expect(texts.providerCurrent("openai")).toContain("openai");
    });

    it("providerNotFound() includes provider name", () => {
      expect(texts.providerNotFound("unknown")).toContain("unknown");
    });

    it("adminPaymentNotification() includes user and amount", () => {
      const result = texts.adminPaymentNotification("@alice", 500);
      expect(result).toContain("@alice");
      expect(result).toContain("500");
    });
  });

  describe("static text constants", () => {
    const staticKeys = [
      "welcome", "helpMenu", "helpRecommendations", "helpImageFormat",
      "helpText", "helpEditing", "helpMultipleCards", "helpReference",
      "helpMergeObjects", "paymentSelectAmount", "infoMenu",
      "infoCapabilities", "infoTerms", "infoSupport", "chooseFormat",
      "generating", "photoWithoutCaption", "textWithoutPhoto",
      "unsupportedDocument", "fileTooLarge", "lowResolutionWarning",
      "generationError", "providerUsage",
    ] as const;

    for (const key of staticKeys) {
      it(`texts.${key} is a non-empty string`, () => {
        const value = texts[key];
        expect(typeof value).toBe("string");
        expect((value as string).length).toBeGreaterThan(0);
      });
    }
  });
});
