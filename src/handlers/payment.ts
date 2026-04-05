import { InlineKeyboard } from "grammy";
import { BotContext } from "../context.js";
import { texts } from "../texts/index.js";
import { topupAmountKeyboard, callbackData, TOPUP_AMOUNTS } from "../keyboards/index.js";
import { createPayment, updatePaymentStatus } from "../db/payments.js";
import { createYooKassaPayment } from "../payments/yookassa.js";
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

  // Check if YooKassa is configured
  if (!config.yookassa.shopId || !config.yookassa.secretKey) {
    await ctx.editMessageText("Оплата временно недоступна. Обратитесь к администратору.");
    return;
  }

  let paymentId: number | undefined;
  try {
    // Create payment record in DB
    paymentId = createPayment(userId, amountKopecks);

    // Create payment in YooKassa
    const yooPayment = await createYooKassaPayment(amountRub, paymentId, userId);

    // Update payment with external ID and confirmation URL
    updatePaymentStatus(paymentId, "pending", yooPayment.id, yooPayment.confirmationUrl);
    console.log("Payment created:", paymentId, "user:", userId, "amount:", amountRub, "RUB, external:", yooPayment.id);

    const keyboard = new InlineKeyboard()
      .url("💳 Оплатить", yooPayment.confirmationUrl).row()
      .text("🔙 Назад", callbackData.balance);

    await ctx.editMessageText(texts.paymentCreated(amountRub, yooPayment.confirmationUrl), {
      reply_markup: keyboard,
    });
  } catch (err) {
    console.error("Payment creation error:", err);
    if (paymentId) updatePaymentStatus(paymentId, "failed");
    await ctx.editMessageText("Ошибка создания платежа. Попробуйте позже.");
  }
}
