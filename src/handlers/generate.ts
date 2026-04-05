import { BotContext } from "../context.js";
import { texts } from "../texts/index.js";
import { formatKeyboard, insufficientBalanceKeyboard, FORMAT_MAP } from "../keyboards/index.js";
import { OpenRouterProvider } from "../providers/openrouter.js";
import { CardFormat } from "../providers/types.js";
import { getGenerationPrice } from "../db/settings.js";
import { deductBalance, addBalance, getUser } from "../db/users.js";
import { createGeneration, completeGeneration, failGeneration } from "../db/generations.js";
import { checkRateLimit } from "../middleware/rateLimit.js";

const provider = new OpenRouterProvider();

interface PendingRequest {
  fileId: string;
  caption: string;
  messageId: number;
  createdAt: number;
}

const pendingRequests = new Map<number, PendingRequest>();

const CLEANUP_INTERVAL = 10 * 60 * 1000; // 10 minutes
const REQUEST_TTL = 30 * 60 * 1000; // 30 minutes

export function startPendingCleanup(): void {
  setInterval(() => {
    const now = Date.now();
    for (const [userId, req] of pendingRequests) {
      if (now - req.createdAt > REQUEST_TTL) {
        pendingRequests.delete(userId);
      }
    }
  }, CLEANUP_INTERVAL);
}

async function processIncomingImage(ctx: BotContext, fileId: string, caption: string): Promise<void> {
  if (!ctx.from) return;
  const userId = ctx.from.id;

  const sent = await ctx.reply(texts.chooseFormat, {
    reply_markup: formatKeyboard(),
  });

  pendingRequests.set(userId, {
    fileId,
    caption,
    messageId: sent.message_id,
    createdAt: Date.now(),
  });
}

export async function handlePhoto(ctx: BotContext): Promise<void> {
  const photo = ctx.message?.photo;
  const caption = ctx.message?.caption?.trim();

  if (!photo || !caption || !ctx.from) {
    const text = photo ? texts.photoWithoutCaption : texts.textWithoutPhoto;
    await ctx.reply(text);
    return;
  }

  const largest = photo[photo.length - 1];

  if (largest.width < 512 && largest.height < 512) {
    await ctx.reply(texts.lowResolutionWarning);
  }

  // Take the second-to-last size for balance of quality vs speed
  const fileId = photo.length > 1
    ? photo[photo.length - 2].file_id
    : photo[photo.length - 1].file_id;

  await processIncomingImage(ctx, fileId, caption);
}

export async function handleDocument(ctx: BotContext): Promise<void> {
  const doc = ctx.message?.document;
  if (!doc || !ctx.from) return;

  // Reject unsupported image formats
  const UNSUPPORTED_MIMES = ["image/svg+xml", "image/gif"];
  if (doc.mime_type && UNSUPPORTED_MIMES.includes(doc.mime_type)) {
    await ctx.reply(texts.unsupportedDocument);
    return;
  }

  // Only handle image documents
  if (!doc.mime_type?.startsWith("image/")) {
    if (ctx.message?.caption) {
      await ctx.reply(texts.unsupportedDocument);
    }
    return;
  }

  const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB
  if (doc.file_size && doc.file_size > MAX_FILE_SIZE) {
    await ctx.reply(texts.fileTooLarge);
    return;
  }

  const caption = ctx.message?.caption?.trim();
  if (!caption) {
    await ctx.reply(texts.photoWithoutCaption);
    return;
  }

  await processIncomingImage(ctx, doc.file_id, caption);
}

export async function handleTextWithoutPhoto(ctx: BotContext): Promise<void> {
  if (ctx.message?.text && !ctx.message.text.startsWith("/")) {
    await ctx.reply(texts.textWithoutPhoto);
  }
}

async function runGeneration(
  ctx: BotContext,
  fileId: string,
  caption: string,
  format: CardFormat,
  statusMessageId: number,
): Promise<void> {
  if (!ctx.chat || !ctx.from) return;
  const chatId = ctx.chat.id;
  const userId = ctx.from.id;
  const price = getGenerationPrice();
  const providerName = "openrouter";

  // Rate limit check
  if (!checkRateLimit(userId)) {
    console.warn("Rate limit exceeded:", userId);
    await ctx.api.editMessageText(chatId, statusMessageId, "Слишком много запросов. Подождите минуту.").catch(() => {});
    return;
  }

  // Deduct balance
  if (!deductBalance(userId, price)) {
    const balanceRub = Math.floor(ctx.dbUser.balance / 100);
    const priceRub = Math.floor(price / 100);
    await ctx.api.editMessageText(chatId, statusMessageId, texts.insufficientBalance(balanceRub, priceRub), {
      reply_markup: insufficientBalanceKeyboard(),
    }).catch(() => {});
    return;
  }

  console.log("Generation started:", userId, "format:", format, "price:", price / 100, "RUB");

  // Record generation in DB
  const genId = createGeneration(userId, price, providerName, format, caption, fileId);

  const typingInterval = setInterval(() => {
    ctx.api.sendChatAction(chatId, "upload_photo").catch(() => {});
  }, 4000);
  await ctx.api.sendChatAction(chatId, "upload_photo").catch(() => {});

  try {
    const file = await ctx.api.getFile(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${ctx.api.token}/${file.file_path}`;
    const response = await fetch(fileUrl, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) {
      throw new Error(`Failed to download photo: ${response.status}`);
    }
    const imageBuffer = Buffer.from(await response.arrayBuffer());

    try {
      const result = await provider.generate({
        imageBuffer,
        userPrompt: caption,
        format,
      });

      const { InputFile } = await import("grammy");
      const sent = await ctx.replyWithPhoto(new InputFile(result.imageBuffer, "card.png"));

      // Save result file_id
      const resultFileId = sent.photo?.[sent.photo.length - 1]?.file_id;
      completeGeneration(genId, resultFileId);
      console.log("Generation completed:", genId, "user:", userId);

      // Re-read balance from DB after deduction
      const updatedUser = getUser(userId);
      if (updatedUser) ctx.dbUser.balance = updatedUser.balance;

      await ctx.api.deleteMessage(chatId, statusMessageId).catch(() => {});
    } catch (err) {
      console.error("Generation error:", err);
      // Refund on AI failure
      addBalance(userId, price);
      failGeneration(genId);
      const refundedUser = getUser(userId);
      if (refundedUser) ctx.dbUser.balance = refundedUser.balance;
      await ctx.api.editMessageText(chatId, statusMessageId, texts.generationError).catch(() => {});
    }
  } catch (err) {
    console.error("File download error:", err);
    // Refund on download failure
    addBalance(userId, price);
    failGeneration(genId);
    const dlRefundedUser = getUser(userId);
    if (dlRefundedUser) ctx.dbUser.balance = dlRefundedUser.balance;
    await ctx.api.editMessageText(chatId, statusMessageId, texts.generationError).catch(() => {});
  } finally {
    clearInterval(typingInterval);
  }
}

export async function handleFormatSelection(ctx: BotContext): Promise<void> {
  const data = ctx.callbackQuery?.data;
  if (!data || !FORMAT_MAP[data]) return;

  if (!ctx.from) return;
  const userId = ctx.from.id;
  const pending = pendingRequests.get(userId);

  if (!pending) {
    await ctx.answerCallbackQuery({ text: "Запрос устарел. Отправьте фото заново." });
    return;
  }

  const messageId = ctx.callbackQuery?.message?.message_id;
  if (!messageId) return;

  pendingRequests.delete(userId);
  const format = FORMAT_MAP[data];

  await ctx.editMessageText(texts.generating);
  await ctx.answerCallbackQuery();

  await runGeneration(ctx, pending.fileId, pending.caption, format, messageId);
}
