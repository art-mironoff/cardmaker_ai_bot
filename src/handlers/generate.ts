import { Context } from "grammy";
import { texts } from "../texts/index.js";
import { formatKeyboard } from "../keyboards/index.js";
import { getProvider } from "../providers/registry.js";
import { CardFormat } from "../providers/types.js";

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

export async function handlePhoto(ctx: Context): Promise<void> {
  const photo = ctx.message?.photo;
  const caption = ctx.message?.caption;

  if (!photo || !caption) {
    const text = photo ? texts.photoWithoutCaption : texts.textWithoutPhoto;
    await ctx.reply(text);
    return;
  }

  const userId = ctx.from!.id;
  // Take the second-to-last size for balance of quality vs speed
  const fileId = photo.length > 1
    ? photo[photo.length - 2].file_id
    : photo[photo.length - 1].file_id;

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

export async function handleTextWithoutPhoto(ctx: Context): Promise<void> {
  if (ctx.message?.text && !ctx.message.text.startsWith("/")) {
    await ctx.reply(texts.textWithoutPhoto);
  }
}

const FORMAT_MAP: Record<string, CardFormat> = {
  "fmt:1x1": "1x1",
  "fmt:3x4": "3x4",
  "fmt:4x3": "4x3",
  "fmt:9x16": "9x16",
};

async function runGeneration(
  ctx: Context,
  fileId: string,
  caption: string,
  format: CardFormat,
  statusMessageId: number,
): Promise<void> {
  const chatId = ctx.chat!.id;

  const typingInterval = setInterval(() => {
    ctx.api.sendChatAction(chatId, "upload_photo").catch(() => {});
  }, 4000);
  await ctx.api.sendChatAction(chatId, "upload_photo").catch(() => {});

  try {
    const file = await ctx.api.getFile(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${ctx.api.token}/${file.file_path}`;
    const response = await fetch(fileUrl);
    if (!response.ok) {
      throw new Error(`Failed to download photo: ${response.status}`);
    }
    const imageBuffer = Buffer.from(await response.arrayBuffer());

    const provider = getProvider();

    try {
      const result = await provider.generate({
        imageBuffer,
        userPrompt: caption,
        format,
      });

      const { InputFile } = await import("grammy");
      await ctx.replyWithPhoto(new InputFile(result.imageBuffer, "card.png"));

      await ctx.api.deleteMessage(chatId, statusMessageId).catch(() => {});
    } catch (err) {
      console.error("Generation error:", err);
      await ctx.api.editMessageText(chatId, statusMessageId, texts.generationError).catch(() => {});
    }
  } finally {
    clearInterval(typingInterval);
  }
}

export async function handleFormatSelection(ctx: Context): Promise<void> {
  const data = ctx.callbackQuery?.data;
  if (!data || !FORMAT_MAP[data]) return;

  const userId = ctx.from!.id;
  const pending = pendingRequests.get(userId);

  if (!pending) {
    await ctx.answerCallbackQuery({ text: "Запрос устарел. Отправьте фото заново." });
    return;
  }

  pendingRequests.delete(userId);
  const format = FORMAT_MAP[data];

  await ctx.editMessageText(texts.generating);
  await ctx.answerCallbackQuery();

  await runGeneration(ctx, pending.fileId, pending.caption, format, ctx.callbackQuery!.message!.message_id);
}

