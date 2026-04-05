import { NextFunction } from "grammy";
import { BotContext } from "../context.js";

export async function block(ctx: BotContext, next: NextFunction): Promise<void> {
  if (ctx.dbUser?.is_blocked) {
    if (ctx.callbackQuery) {
      await ctx.answerCallbackQuery({ text: "Ваш аккаунт заблокирован." });
    } else {
      await ctx.reply("Ваш аккаунт заблокирован.");
    }
    return;
  }

  await next();
}
