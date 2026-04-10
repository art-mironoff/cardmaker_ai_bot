import { describe, it, expect, vi } from "vitest";

vi.mock("../src/config.js", () => ({
  config: {
    adminIds: [111, 222],
  },
}));

const {
  callbackData,
  FORMAT_MAP,
  TOPUP_AMOUNTS,
  mainMenuKeyboard,
  helpMenuKeyboard,
  backToHelpKeyboard,
  infoMenuKeyboard,
  backToInfoKeyboard,
  termsKeyboard,
  balanceKeyboard,
  topupAmountKeyboard,
  insufficientBalanceKeyboard,
  backToBalanceKeyboard,
  formatKeyboard,
} = await import("../src/keyboards/index.js");

// Helper to extract button text and callback data from InlineKeyboard
function getButtons(keyboard: ReturnType<typeof mainMenuKeyboard>): Array<{ text: string; callback_data?: string; url?: string }> {
  const raw = (keyboard as unknown as { inline_keyboard: Array<Array<{ text: string; callback_data?: string; url?: string }>> }).inline_keyboard;
  return raw.flat();
}

describe("keyboards/index", () => {
  describe("callbackData", () => {
    it("has all expected callback data keys", () => {
      expect(callbackData.help).toBe("menu:help");
      expect(callbackData.balance).toBe("menu:balance");
      expect(callbackData.info).toBe("menu:info");
      expect(callbackData.backToStart).toBe("back:start");
      expect(callbackData.format1x1).toBe("fmt:1x1");
      expect(callbackData.format3x4).toBe("fmt:3x4");
      expect(callbackData.format4x3).toBe("fmt:4x3");
      expect(callbackData.format9x16).toBe("fmt:9x16");
      expect(callbackData.topup).toBe("pay:topup");
    });
  });

  describe("FORMAT_MAP", () => {
    it("maps callback data to format strings", () => {
      expect(FORMAT_MAP["fmt:1x1"]).toBe("1x1");
      expect(FORMAT_MAP["fmt:3x4"]).toBe("3x4");
      expect(FORMAT_MAP["fmt:4x3"]).toBe("4x3");
      expect(FORMAT_MAP["fmt:9x16"]).toBe("9x16");
    });

    it("has exactly 4 formats", () => {
      expect(Object.keys(FORMAT_MAP)).toHaveLength(4);
    });
  });

  describe("TOPUP_AMOUNTS", () => {
    it("has all expected amounts", () => {
      expect(TOPUP_AMOUNTS["pay:50"]).toBe(50);
      expect(TOPUP_AMOUNTS["pay:100"]).toBe(100);
      expect(TOPUP_AMOUNTS["pay:250"]).toBe(250);
      expect(TOPUP_AMOUNTS["pay:500"]).toBe(500);
      expect(TOPUP_AMOUNTS["pay:1000"]).toBe(1000);
      expect(TOPUP_AMOUNTS["pay:5000"]).toBe(5000);
    });
  });

  describe("mainMenuKeyboard", () => {
    it("shows standard buttons for regular user", () => {
      const kb = mainMenuKeyboard(12345);
      const buttons = getButtons(kb);
      const callbacks = buttons.map((b) => b.callback_data);
      expect(callbacks).toContain(callbackData.help);
      expect(callbacks).toContain(callbackData.balance);
      expect(callbacks).toContain(callbackData.info);
      expect(callbacks).not.toContain("admin:open");
    });

    it("shows admin button for admin user", () => {
      const kb = mainMenuKeyboard(111); // admin ID
      const buttons = getButtons(kb);
      const callbacks = buttons.map((b) => b.callback_data);
      expect(callbacks).toContain("admin:open");
    });

    it("hides admin button when no userId", () => {
      const kb = mainMenuKeyboard();
      const buttons = getButtons(kb);
      const callbacks = buttons.map((b) => b.callback_data);
      expect(callbacks).not.toContain("admin:open");
    });
  });

  describe("helpMenuKeyboard", () => {
    it("contains all help topic buttons", () => {
      const buttons = getButtons(helpMenuKeyboard());
      const callbacks = buttons.map((b) => b.callback_data);
      expect(callbacks).toContain(callbackData.helpRecommendations);
      expect(callbacks).toContain(callbackData.helpImageFormat);
      expect(callbacks).toContain(callbackData.helpText);
      expect(callbacks).toContain(callbackData.helpEditing);
      expect(callbacks).toContain(callbackData.helpMultipleCards);
      expect(callbacks).toContain(callbackData.helpReference);
      expect(callbacks).toContain(callbackData.helpMergeObjects);
      expect(callbacks).toContain(callbackData.backToStart);
    });
  });

  describe("backToHelpKeyboard", () => {
    it("has back button to help", () => {
      const buttons = getButtons(backToHelpKeyboard());
      expect(buttons[0].callback_data).toBe(callbackData.backToHelp);
    });
  });

  describe("infoMenuKeyboard", () => {
    it("contains info topic buttons", () => {
      const buttons = getButtons(infoMenuKeyboard());
      const callbacks = buttons.map((b) => b.callback_data);
      expect(callbacks).toContain(callbackData.infoCapabilities);
      expect(callbacks).toContain(callbackData.infoTerms);
      expect(callbacks).toContain(callbackData.infoSupport);
      expect(callbacks).toContain(callbackData.backToStart);
    });
  });

  describe("termsKeyboard", () => {
    it("contains URL buttons and back button", () => {
      const buttons = getButtons(termsKeyboard());
      const urls = buttons.filter((b) => b.url);
      expect(urls).toHaveLength(2);
      expect(buttons.some((b) => b.callback_data === callbackData.backToInfo)).toBe(true);
    });
  });

  describe("balanceKeyboard", () => {
    it("has topup and tariffs buttons", () => {
      const buttons = getButtons(balanceKeyboard());
      const callbacks = buttons.map((b) => b.callback_data);
      expect(callbacks).toContain(callbackData.topup);
      expect(callbacks).toContain(callbackData.tariffs);
      expect(callbacks).toContain(callbackData.backToStart);
    });
  });

  describe("topupAmountKeyboard", () => {
    it("has all amount buttons", () => {
      const buttons = getButtons(topupAmountKeyboard());
      const callbacks = buttons.map((b) => b.callback_data);
      expect(callbacks).toContain("pay:50");
      expect(callbacks).toContain("pay:100");
      expect(callbacks).toContain("pay:250");
      expect(callbacks).toContain("pay:500");
      expect(callbacks).toContain("pay:1000");
      expect(callbacks).toContain("pay:5000");
      expect(callbacks).toContain(callbackData.backToBalance);
    });
  });

  describe("formatKeyboard", () => {
    it("has all format buttons", () => {
      const buttons = getButtons(formatKeyboard());
      const callbacks = buttons.map((b) => b.callback_data);
      expect(callbacks).toContain(callbackData.format1x1);
      expect(callbacks).toContain(callbackData.format3x4);
      expect(callbacks).toContain(callbackData.format4x3);
      expect(callbacks).toContain(callbackData.format9x16);
    });
  });

  describe("insufficientBalanceKeyboard", () => {
    it("has topup and back buttons", () => {
      const buttons = getButtons(insufficientBalanceKeyboard());
      const callbacks = buttons.map((b) => b.callback_data);
      expect(callbacks).toContain(callbackData.topup);
      expect(callbacks).toContain(callbackData.backToStart);
    });
  });
});
