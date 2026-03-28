import { Context } from "grammy";
import { texts } from "../texts/index.js";
import {
  mainMenuKeyboard,
  helpMenuKeyboard,
  backToHelpKeyboard,
  infoMenuKeyboard,
  backToInfoKeyboard,
  balanceKeyboard,
  backToBalanceKeyboard,
} from "../keyboards/index.js";

async function safeEditOrReply(
  ctx: Context,
  text: string,
  reply_markup: ReturnType<typeof mainMenuKeyboard>,
): Promise<void> {
  if (ctx.callbackQuery) {
    await ctx.answerCallbackQuery().catch(() => {});
  }
  if (ctx.callbackQuery?.message) {
    try {
      await ctx.editMessageText(text, { reply_markup });
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes("message is not modified")) {
        // ignore — user clicked the same button again
      } else {
        throw err;
      }
    }
  } else {
    await ctx.reply(text, { reply_markup });
  }
}

// Main menu screens

export async function handleHelpCallback(ctx: Context): Promise<void> {
  await safeEditOrReply(ctx, texts.helpMenu, helpMenuKeyboard());
}

export async function handleBalanceCallback(ctx: Context): Promise<void> {
  await safeEditOrReply(ctx, texts.balance, balanceKeyboard());
}

export async function handleInfoCallback(ctx: Context): Promise<void> {
  await safeEditOrReply(ctx, texts.infoMenu, infoMenuKeyboard());
}

export async function handleBackToStart(ctx: Context): Promise<void> {
  await safeEditOrReply(ctx, texts.welcome, mainMenuKeyboard());
}

// Help topics

export async function handleHelpRecommendations(ctx: Context): Promise<void> {
  await safeEditOrReply(ctx, texts.helpRecommendations, backToHelpKeyboard());
}

export async function handleHelpImageFormat(ctx: Context): Promise<void> {
  await safeEditOrReply(ctx, texts.helpImageFormat, backToHelpKeyboard());
}

export async function handleHelpText(ctx: Context): Promise<void> {
  await safeEditOrReply(ctx, texts.helpText, backToHelpKeyboard());
}

export async function handleHelpEditing(ctx: Context): Promise<void> {
  await safeEditOrReply(ctx, texts.helpEditing, backToHelpKeyboard());
}

export async function handleHelpMultipleCards(ctx: Context): Promise<void> {
  await safeEditOrReply(ctx, texts.helpMultipleCards, backToHelpKeyboard());
}

export async function handleHelpReference(ctx: Context): Promise<void> {
  await safeEditOrReply(ctx, texts.helpReference, backToHelpKeyboard());
}

export async function handleHelpMergeObjects(ctx: Context): Promise<void> {
  await safeEditOrReply(ctx, texts.helpMergeObjects, backToHelpKeyboard());
}

// Back to help menu

export async function handleBackToHelp(ctx: Context): Promise<void> {
  await safeEditOrReply(ctx, texts.helpMenu, helpMenuKeyboard());
}

// Info topics

export async function handleInfoCapabilities(ctx: Context): Promise<void> {
  await safeEditOrReply(ctx, texts.infoCapabilities, backToInfoKeyboard());
}

export async function handleInfoTerms(ctx: Context): Promise<void> {
  await safeEditOrReply(ctx, texts.infoTerms, backToInfoKeyboard());
}

export async function handleInfoSupport(ctx: Context): Promise<void> {
  await safeEditOrReply(ctx, texts.infoSupport, backToInfoKeyboard());
}

// Back to info menu

export async function handleBackToInfo(ctx: Context): Promise<void> {
  await safeEditOrReply(ctx, texts.infoMenu, infoMenuKeyboard());
}

// Tariffs

export async function handleTariffsCallback(ctx: Context): Promise<void> {
  await safeEditOrReply(ctx, texts.tariffs, backToBalanceKeyboard());
}

// Back to balance

export async function handleBackToBalance(ctx: Context): Promise<void> {
  await safeEditOrReply(ctx, texts.balance, balanceKeyboard());
}
