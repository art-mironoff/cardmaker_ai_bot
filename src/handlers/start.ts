import { BotContext } from "../context.js";
import { texts } from "../texts/index.js";
import { mainMenuKeyboard } from "../keyboards/index.js";

export async function handleStart(ctx: BotContext): Promise<void> {
  await ctx.reply(texts.welcome, { reply_markup: mainMenuKeyboard(ctx.from?.id) });
}
