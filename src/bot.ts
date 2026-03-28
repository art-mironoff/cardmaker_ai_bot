import { Bot } from "grammy";
import { config } from "./config.js";
import { whitelist } from "./middleware/whitelist.js";
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
import { handlePhoto, handleTextWithoutPhoto, handleFormatSelection, startPendingCleanup } from "./handlers/generate.js";
import { handleProvider } from "./handlers/provider.js";
import { registerProvider, switchProvider } from "./providers/registry.js";
import { OpenRouterProvider } from "./providers/openrouter.js";

// Initialize bot
const bot = new Bot(config.botToken);

// Register providers
registerProvider(new OpenRouterProvider());
switchProvider("openrouter");

// Middleware
// bot.use(whitelist);

// Commands
bot.command("start", handleStart);
bot.command("provider", handleProvider);

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

// Callback queries — balance & tariffs
bot.callbackQuery(callbackData.tariffs, handleTariffsCallback);
bot.callbackQuery(callbackData.backToBalance, handleBackToBalance);

// Callback queries — format selection
bot.callbackQuery(/^fmt:/, handleFormatSelection);

// Message handlers
bot.on("message:photo", handlePhoto);
bot.on("message:text", handleTextWithoutPhoto);

// Start cleanup
startPendingCleanup();

// Start bot
bot.catch((err) => {
  console.error("Bot error:", err);
});

bot.start({
  onStart: () => console.log("Bot started"),
});
