import { InlineKeyboard } from "grammy";

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
  // Balance
  tariffs: "menu:tariffs",
  // Formats
  format1x1: "fmt:1x1",
  format3x4: "fmt:3x4",
  format4x3: "fmt:4x3",
  format9x16: "fmt:9x16",
} as const;

export function mainMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("❓ Как генерировать", callbackData.help).row()
    .text("💰 Баланс", callbackData.balance).row()
    .text("ℹ️ Информация", callbackData.info);
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

export function balanceKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("📋 Тарифы", callbackData.tariffs).row()
    .text("🔙 Назад", callbackData.backToStart);
}

export function backToBalanceKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text("🔙 Назад", callbackData.backToBalance);
}

export function backKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text("🔙 Назад", callbackData.backToStart);
}

export function formatKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("1:1", callbackData.format1x1)
    .text("3:4", callbackData.format3x4).row()
    .text("4:3", callbackData.format4x3)
    .text("9:16", callbackData.format9x16);
}

