import { Context } from "grammy";
import { texts } from "../texts/index.js";
import { mainMenuKeyboard } from "../keyboards/index.js";

export async function handleStart(ctx: Context): Promise<void> {
  await ctx.reply(texts.welcome, { reply_markup: mainMenuKeyboard() });
}
