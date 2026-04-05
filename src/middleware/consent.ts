import { NextFunction } from "grammy";
import { InlineKeyboard } from "grammy";
import { BotContext } from "../context.js";
import { isConsentRequired } from "../db/settings.js";
import { setConsent } from "../db/users.js";

const CONSENT_CALLBACK = "consent:accept";

const consentText = `Для использования бота необходимо согласие на обработку персональных данных.

Нажимая кнопку ниже, вы даёте согласие на обработку ваших данных (Telegram ID, имя пользователя) в соответствии с Политикой конфиденциальности.`;

export async function consent(ctx: BotContext, next: NextFunction): Promise<void> {
  if (!isConsentRequired()) {
    await next();
    return;
  }

  if (!ctx.dbUser || ctx.dbUser.consent_given) {
    await next();
    return;
  }

  // Allow consent callback to pass through
  if (ctx.callbackQuery?.data === CONSENT_CALLBACK) {
    await next();
    return;
  }

  const keyboard = new InlineKeyboard().text("Я согласен", CONSENT_CALLBACK);
  await ctx.reply(consentText, { reply_markup: keyboard });
}

export function getConsentCallback(): string {
  return CONSENT_CALLBACK;
}

export async function handleConsentAccept(ctx: BotContext): Promise<void> {
  if (!ctx.from) return;

  setConsent(ctx.from.id, true);
  ctx.dbUser.consent_given = 1;

  await ctx.answerCallbackQuery({ text: "Спасибо!" });
  await ctx.editMessageText("Согласие принято. Отправьте /start для начала работы.");
}
