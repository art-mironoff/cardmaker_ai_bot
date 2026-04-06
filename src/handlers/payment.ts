import { InlineKeyboard } from "grammy";
import { BotContext } from "../context.js";
import { texts } from "../texts/index.js";
import { topupAmountKeyboard, callbackData, TOPUP_AMOUNTS } from "../keyboards/index.js";
import { createPayment, updatePaymentStatus } from "../db/payments.js";
import { buildPaymentUrl } from "../payments/yoomoney.js";
import { config } from "../config.js";

export async function handleTopupCallback(ctx: BotContext): Promise<void> {
  await ctx.answerCallbackQuery().catch(() => {});
  await ctx.editMessageText(texts.paymentSelectAmount, { reply_markup: topupAmountKeyboard() });
}

export async function handlePaymentAmountCallback(ctx: BotContext): Promise<void> {
  const data = ctx.callbackQuery?.data;
  if (!data || !TOPUP_AMOUNTS[data]) return;

  await ctx.answerCallbackQuery().catch(() => {});

  const amountRub = TOPUP_AMOUNTS[data];
  const amountKopecks = amountRub * 100;
  const userId = ctx.from!.id;

  if (!config.yoomoney.walletId) {
    await ctx.editMessageText("Оплата временно недоступна. Обратитесь к администратору.");
    return;
  }

  // Create payment record in DB
  const paymentId = createPayment(userId, amountKopecks);

  // Build YooMoney payment URL (no API call needed)
  const confirmationUrl = buildPaymentUrl(amountRub, paymentId);

  // Update payment with confirmation URL
  updatePaymentStatus(paymentId, "pending", undefined, confirmationUrl);
  console.log("Payment created:", paymentId, "user:", userId, "amount:", amountRub, "RUB");

  const keyboard = new InlineKeyboard()
    .url("💳 Оплатить", confirmationUrl).row()
    .text("🔙 Назад", callbackData.balance);

  await ctx.editMessageText(texts.paymentCreated(amountRub, confirmationUrl), {
    reply_markup: keyboard,
  });
}
