import { Bot } from "grammy";
import { BotContext } from "./context.js";
import { config } from "./config.js";
import { initDb, closeDb } from "./db/index.js";
import { auth } from "./middleware/auth.js";
import { consent, handleConsentAccept, getConsentCallback } from "./middleware/consent.js";
import { block } from "./middleware/block.js";
import { callbackData } from "./keyboards/index.js";
import { handleStart } from "./handlers/start.js";
import {
  handleHelpCallback,
  handleBalanceCallback,
  handleInfoCallback,
  handleBackToStart,
  handleHelpRecommendations,
  handleHelpImageFormat,
  handleHelpText,
  handleHelpEditing,
  handleHelpMultipleCards,
  handleHelpReference,
  handleHelpMergeObjects,
  handleBackToHelp,
  handleInfoCapabilities,
  handleInfoTerms,
  handleInfoSupport,
  handleBackToInfo,
  handleTariffsCallback,
  handleBackToBalance,
} from "./handlers/menu.js";
import { handlePhoto, handleDocument, handleTextWithoutPhoto, handleFormatSelection, startPendingCleanup } from "./handlers/generate.js";
import { handleAdminCommand, handleAdminCallback, handleAdminTextInput } from "./handlers/admin.js";
import { handleTopupCallback, handlePaymentAmountCallback } from "./handlers/payment.js";
import { startWebhookServer } from "./webhook.js";

// Initialize database
initDb();

// Initialize bot
const bot = new Bot<BotContext>(config.botToken);

// Middleware
bot.use(auth);
bot.use(block);
bot.use(consent);

// Consent callback
bot.callbackQuery(getConsentCallback(), handleConsentAccept);

// Commands
bot.command("start", handleStart);
bot.command("help", handleHelpCallback);
bot.command("balance", handleBalanceCallback);
bot.command("admin", handleAdminCommand);

// Callback queries — main menu
bot.callbackQuery(callbackData.help, handleHelpCallback);
bot.callbackQuery(callbackData.balance, handleBalanceCallback);
bot.callbackQuery(callbackData.info, handleInfoCallback);
bot.callbackQuery(callbackData.backToStart, handleBackToStart);

// Callback queries — help topics
bot.callbackQuery(callbackData.helpRecommendations, handleHelpRecommendations);
bot.callbackQuery(callbackData.helpImageFormat, handleHelpImageFormat);
bot.callbackQuery(callbackData.helpText, handleHelpText);
bot.callbackQuery(callbackData.helpEditing, handleHelpEditing);
bot.callbackQuery(callbackData.helpMultipleCards, handleHelpMultipleCards);
bot.callbackQuery(callbackData.helpReference, handleHelpReference);
bot.callbackQuery(callbackData.helpMergeObjects, handleHelpMergeObjects);
bot.callbackQuery(callbackData.backToHelp, handleBackToHelp);

// Callback queries — info topics
bot.callbackQuery(callbackData.infoCapabilities, handleInfoCapabilities);
bot.callbackQuery(callbackData.infoTerms, handleInfoTerms);
bot.callbackQuery(callbackData.infoSupport, handleInfoSupport);
bot.callbackQuery(callbackData.backToInfo, handleBackToInfo);

// Callback queries — balance, tariffs & payment
bot.callbackQuery(callbackData.tariffs, handleTariffsCallback);
bot.callbackQuery(callbackData.backToBalance, handleBackToBalance);
bot.callbackQuery(callbackData.topup, handleTopupCallback);
bot.callbackQuery(/^pay:\d+$/, handlePaymentAmountCallback);

// Callback queries — admin
bot.callbackQuery(/^admin:/, handleAdminCallback);

// Callback queries — format selection
bot.callbackQuery(/^fmt:/, handleFormatSelection);

// Message handlers
bot.on("message:photo", handlePhoto);
bot.on("message:document", handleDocument);
bot.on("message:text", async (ctx) => {
  // Check if admin is entering a value
  const handled = await handleAdminTextInput(ctx);
  if (!handled) {
    await handleTextWithoutPhoto(ctx);
  }
});

// Start cleanup
startPendingCleanup();

// Error handler
bot.catch((err) => {
  const error = err.error ?? err;
  console.error("Bot error:", error instanceof Error ? `${error.message}\n${error.stack}` : String(error));
});

// Graceful shutdown
let shuttingDown = false;
async function shutdown(): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log("Shutting down...");
  await bot.stop();
  closeDb();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// Start webhook server for YooMoney
startWebhookServer(bot);

// Start bot
bot.start({
  onStart: async () => {
    console.log("Bot started");

    // Clear cached commands for all scopes
    await bot.api.deleteMyCommands();
    await bot.api.deleteMyCommands({ scope: { type: "all_private_chats" } });
    await bot.api.deleteMyCommands({ scope: { type: "all_group_chats" } });

    // Set menu commands for all users
    await bot.api.setMyCommands([
      { command: "start", description: "Главное меню" },
      { command: "help", description: "Как генерировать" },
      { command: "balance", description: "Баланс" },
    ]);

    // Ensure menu button is visible for all users
    await bot.api.setChatMenuButton({ menu_button: { type: "commands" } });

    // Set menu commands for admins (includes /admin)
    const adminCommands = [
      { command: "start", description: "Главное меню" },
      { command: "help", description: "Как генерировать" },
      { command: "balance", description: "Баланс" },
      { command: "admin", description: "Админ-панель" },
    ];
    for (const adminId of config.adminIds) {
      try {
        await bot.api.deleteMyCommands({
          scope: { type: "chat", chat_id: adminId },
        });
        await bot.api.setMyCommands(adminCommands, {
          scope: { type: "chat", chat_id: adminId },
        });
        await bot.api.setChatMenuButton({
          chat_id: adminId,
          menu_button: { type: "commands" },
        });
      } catch (err) {
        console.warn(`Failed to set admin commands for ${adminId} (chat not found?), skipping`);
      }
    }
  },
});
