import { BotContext } from "../context.js";
import { texts } from "../texts/index.js";
import { getGenerationPrice } from "../db/settings.js";
import {
  mainMenuKeyboard,
  helpMenuKeyboard,
  backToHelpKeyboard,
  infoMenuKeyboard,
  backToInfoKeyboard,
  termsKeyboard,
  balanceKeyboard,
  backToBalanceKeyboard,
} from "../keyboards/index.js";

async function safeEditOrReply(
  ctx: BotContext,
  text: string,
  reply_markup: ReturnType<typeof mainMenuKeyboard>,
): Promise<void> {
  if (ctx.callbackQuery) {
    await ctx.answerCallbackQuery().catch(() => {});
  }
  if (ctx.callbackQuery?.message) {
    try {
      await ctx.editMessageText(text, { reply_markup, parse_mode: "HTML" });
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes("message is not modified")) {
        // ignore — user clicked the same button again
      } else {
        throw err;
      }
    }
  } else {
    await ctx.reply(text, { reply_markup, parse_mode: "HTML" });
  }
}

// Main menu screens

export async function handleHelpCallback(ctx: BotContext): Promise<void> {
  await safeEditOrReply(ctx, texts.helpMenu, helpMenuKeyboard());
}

export async function handleBalanceCallback(ctx: BotContext): Promise<void> {
  const balanceRub = Math.floor(ctx.dbUser.balance / 100);
  await safeEditOrReply(ctx, texts.balance(balanceRub), balanceKeyboard());
}

export async function handleInfoCallback(ctx: BotContext): Promise<void> {
  await safeEditOrReply(ctx, texts.infoMenu, infoMenuKeyboard());
}

export async function handleBackToStart(ctx: BotContext): Promise<void> {
  await safeEditOrReply(ctx, texts.welcome, mainMenuKeyboard(ctx.from?.id));
}

// Help topics

export async function handleHelpRecommendations(ctx: BotContext): Promise<void> {
  await safeEditOrReply(ctx, texts.helpRecommendations, backToHelpKeyboard());
}

export async function handleHelpImageFormat(ctx: BotContext): Promise<void> {
  await safeEditOrReply(ctx, texts.helpImageFormat, backToHelpKeyboard());
}

export async function handleHelpText(ctx: BotContext): Promise<void> {
  await safeEditOrReply(ctx, texts.helpText, backToHelpKeyboard());
}

export async function handleHelpEditing(ctx: BotContext): Promise<void> {
  await safeEditOrReply(ctx, texts.helpEditing, backToHelpKeyboard());
}

export async function handleHelpMultipleCards(ctx: BotContext): Promise<void> {
  await safeEditOrReply(ctx, texts.helpMultipleCards, backToHelpKeyboard());
}

export async function handleHelpReference(ctx: BotContext): Promise<void> {
  await safeEditOrReply(ctx, texts.helpReference, backToHelpKeyboard());
}

export async function handleHelpMergeObjects(ctx: BotContext): Promise<void> {
  await safeEditOrReply(ctx, texts.helpMergeObjects, backToHelpKeyboard());
}

// Back to help menu

export async function handleBackToHelp(ctx: BotContext): Promise<void> {
  await safeEditOrReply(ctx, texts.helpMenu, helpMenuKeyboard());
}

// Info topics

export async function handleInfoCapabilities(ctx: BotContext): Promise<void> {
  await safeEditOrReply(ctx, texts.infoCapabilities, backToInfoKeyboard());
}

export async function handleInfoTerms(ctx: BotContext): Promise<void> {
  await safeEditOrReply(ctx, texts.infoTerms, termsKeyboard());
}

export async function handleInfoSupport(ctx: BotContext): Promise<void> {
  await safeEditOrReply(ctx, texts.infoSupport, backToInfoKeyboard());
}

// Back to info menu

export async function handleBackToInfo(ctx: BotContext): Promise<void> {
  await safeEditOrReply(ctx, texts.infoMenu, infoMenuKeyboard());
}

// Tariffs

export async function handleTariffsCallback(ctx: BotContext): Promise<void> {
  const priceRub = Math.floor(getGenerationPrice() / 100);
  await safeEditOrReply(ctx, texts.tariffs(priceRub), backToBalanceKeyboard());
}

// Back to balance

export async function handleBackToBalance(ctx: BotContext): Promise<void> {
  const balanceRub = Math.floor(ctx.dbUser.balance / 100);
  await safeEditOrReply(ctx, texts.balance(balanceRub), balanceKeyboard());
}
