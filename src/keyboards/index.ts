import { InlineKeyboard } from "grammy";
import { config } from "../config.js";

export const callbackData = {
  help: "menu:help",
  balance: "menu:balance",
  info: "menu:info",
  backToStart: "back:start",
  backToHelp: "back:help",
  backToInfo: "back:info",
  backToBalance: "back:balance",
  // Help topics
  helpRecommendations: "help:recommendations",
  helpImageFormat: "help:image_format",
  helpText: "help:text",
  helpEditing: "help:editing",
  helpMultipleCards: "help:multiple_cards",
  helpReference: "help:reference",
  helpMergeObjects: "help:merge_objects",
  // Info topics
  infoCapabilities: "info:capabilities",
  infoTerms: "info:terms",
  infoSupport: "info:support",
  // Balance & payment
  tariffs: "menu:tariffs",
  topup: "pay:topup",
  // Formats
  format1x1: "fmt:1x1",
  format3x4: "fmt:3x4",
  format4x3: "fmt:4x3",
  format9x16: "fmt:9x16",
} as const;

export const FORMAT_MAP: Record<string, "1x1" | "3x4" | "4x3" | "9x16"> = {
  [callbackData.format1x1]: "1x1",
  [callbackData.format3x4]: "3x4",
  [callbackData.format4x3]: "4x3",
  [callbackData.format9x16]: "9x16",
};

export const TOPUP_AMOUNTS: Record<string, number> = {
  "pay:50": 50,
  "pay:100": 100,
  "pay:250": 250,
  "pay:500": 500,
  "pay:1000": 1000,
  "pay:5000": 5000,
};

export function mainMenuKeyboard(userId?: number): InlineKeyboard {
  const kb = new InlineKeyboard()
    .text("❓ Как генерировать", callbackData.help).row()
    .text("💰 Баланс", callbackData.balance).row()
    .text("ℹ️ Информация", callbackData.info);
  if (userId && config.adminIds.includes(userId)) {
    kb.row().text("⚙️ Админ-панель", "admin:open");
  }
  return kb;
}

export function helpMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("✨ Рекомендации", callbackData.helpRecommendations)
    .text("🖼️ Формат изображения", callbackData.helpImageFormat).row()
    .text("✏️ Работа с текстом", callbackData.helpText)
    .text("🎨 Редактирование", callbackData.helpEditing).row()
    .text("🗂️ Несколько карточек", callbackData.helpMultipleCards)
    .text("🔍 По референсу", callbackData.helpReference).row()
    .text("🧩 Объединение объектов", callbackData.helpMergeObjects).row()
    .text("🔙 Назад", callbackData.backToStart);
}

export function backToHelpKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text("🔙 Назад", callbackData.backToHelp);
}

export function infoMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("🚀 Возможности бота", callbackData.infoCapabilities).row()
    .text("📜 Условия использования", callbackData.infoTerms).row()
    .text("💬 Поддержка", callbackData.infoSupport).row()
    .text("🔙 Назад", callbackData.backToStart);
}

export function backToInfoKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text("🔙 Назад", callbackData.backToInfo);
}

export function termsKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .url("🔒 Политика конфиденциальности", "https://telegra.ph/Politika-konfidencialnosti-04-07-44").row()
    .url("🔒 Пользовательское соглашение", "https://telegra.ph/Polzovatelskoe-soglashenie-04-07-29").row()
    .text("🔙 Назад", callbackData.backToInfo);
}

export function balanceKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("➕ Пополнить баланс", callbackData.topup).row()
    .text("📋 Тарифы", callbackData.tariffs).row()
    .text("🔙 Назад", callbackData.backToStart);
}

export function topupAmountKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("50 ₽", "pay:50").text("100 ₽", "pay:100").row()
    .text("250 ₽", "pay:250").text("500 ₽", "pay:500").row()
    .text("1000 ₽", "pay:1000").text("5000 ₽", "pay:5000").row()
    .text("🔙 Назад", callbackData.backToBalance);
}

export function insufficientBalanceKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("➕ Пополнить баланс", callbackData.topup).row()
    .text("🔙 Назад", callbackData.backToStart);
}

export function backToBalanceKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text("🔙 Назад", callbackData.backToBalance);
}

export function formatKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("1:1", callbackData.format1x1)
    .text("3:4", callbackData.format3x4).row()
    .text("4:3", callbackData.format4x3)
    .text("9:16", callbackData.format9x16);
}

