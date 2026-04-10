import { InlineKeyboard } from "grammy";
import { BotContext } from "../context.js";
import { config } from "../config.js";
import { mainMenuKeyboard } from "../keyboards/index.js";
import { texts } from "../texts/index.js";
import { listUsers, getUser, addBalance, setBlocked, getUserCount, getActiveUsersCount, type UserWithStats } from "../db/users.js";
import { getGenerationStats, getRecentGenerations, getGenerationCount, getGeneration } from "../db/generations.js";
import { getRecentPayments, getPaymentStats, getPaymentCount } from "../db/payments.js";
import { setSetting, getGenerationPrice, getWelcomeBalance } from "../db/settings.js";
import { formatDateMoscow } from "../texts/index.js";

const USERS_PER_PAGE = 10;

// Admin input state: tracks what value the admin is currently entering
const adminInputState = new Map<number, { type: string; data?: Record<string, unknown>; returnTo: string; createdAt: number }>();

const INPUT_TTL = 5 * 60 * 1000; // 5 minutes
const INPUT_CLEANUP_INTERVAL = 10 * 60 * 1000; // 10 minutes

setInterval(() => {
  const now = Date.now();
  for (const [id, state] of adminInputState) {
    if (now - state.createdAt > INPUT_TTL) {
      adminInputState.delete(id);
    }
  }
}, INPUT_CLEANUP_INTERVAL);

function isAdmin(ctx: BotContext): boolean {
  return config.adminIds.includes(ctx.from?.id ?? 0);
}

// --- Admin menu ---

export async function handleAdminCommand(ctx: BotContext): Promise<void> {
  if (!isAdmin(ctx)) return;
  await ctx.reply(adminMenuText(), { reply_markup: adminMenuKeyboard() });
}

function adminMenuText(): string {
  return "⚙️ Панель администратора";
}

function adminMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("👥 Пользователи", "admin:users:0").row()
    .text("📊 Статистика", "admin:stats").row()
    .text("🖼️ Генерации", "admin:recent_gens:0").row()
    .text("💳 Платежи", "admin:recent_pays:0").row()
    .text("⚙️ Настройки", "admin:settings").row()
    .text("📢 Рассылка", "admin:broadcast").row()
    .text("🔙 Назад", "admin:back_to_main");
}

export async function handleAdminCallback(ctx: BotContext): Promise<void> {
  if (!isAdmin(ctx)) {
    await ctx.answerCallbackQuery({ text: "Нет доступа" });
    return;
  }

  const data = ctx.callbackQuery?.data;
  if (!data) return;

  await ctx.answerCallbackQuery().catch(() => {});

  if (data === "admin:noop") {
    return;
  }

  if (data.startsWith("admin:goto:")) {
    // Format: admin:goto:admin:recent_pays:5 — last segment is current page, rest is prefix
    const payload = data.slice("admin:goto:".length);
    const lastColon = payload.lastIndexOf(":");
    const callbackPrefix = payload.slice(0, lastColon + 1);
    const currentPage = payload.slice(lastColon + 1);
    adminInputState.set(ctx.from!.id, { type: "goto_page", data: { callbackPrefix }, returnTo: `${callbackPrefix}${currentPage}`, createdAt: Date.now() });
    await ctx.editMessageText("Введите номер страницы:", { reply_markup: cancelInputKeyboard() });
    return;
  }

  if (data === "admin:menu") {
    await ctx.editMessageText(adminMenuText(), { reply_markup: adminMenuKeyboard() });
    return;
  }

  if (data === "admin:open") {
    await ctx.editMessageText(adminMenuText(), { reply_markup: adminMenuKeyboard() });
    return;
  }

  if (data === "admin:back_to_main") {
    await ctx.deleteMessage().catch(() => {});
    await ctx.reply(texts.welcome, { reply_markup: mainMenuKeyboard(ctx.from?.id) });
    return;
  }

  if (data === "admin:cancel_input") {
    const state = adminInputState.get(ctx.from!.id);
    const returnTo = state?.returnTo ?? "admin:menu";
    adminInputState.delete(ctx.from!.id);
    // Re-dispatch to the returnTo callback
    ctx.callbackQuery!.data = returnTo;
    await handleAdminCallback(ctx);
    return;
  }

  if (data.startsWith("admin:users:")) {
    const page = parseInt(data.split(":")[2], 10);
    if (isNaN(page) || page < 0) return;
    await showUserList(ctx, page);
    return;
  }

  if (data.startsWith("admin:user:")) {
    const parts = data.split(":");
    const telegramId = parseInt(parts[2], 10);
    const fromPage = parseInt(parts[3], 10) || 0;
    if (isNaN(telegramId)) return;
    await showUserDetail(ctx, telegramId, fromPage);
    return;
  }

  if (data.startsWith("admin:addbal:")) {
    const parts = data.split(":");
    const telegramId = parseInt(parts[2], 10);
    const fromPage = parseInt(parts[3], 10) || 0;
    if (isNaN(telegramId)) return;
    const user = getUser(telegramId);
    const displayName = user?.first_name || (user?.username ? `@${user.username}` : String(telegramId));
    adminInputState.set(ctx.from!.id, { type: "addbal", data: { telegramId, fromPage }, returnTo: `admin:user:${telegramId}:${fromPage}`, createdAt: Date.now() });
    await ctx.editMessageText(`Введите сумму для начисления (в рублях) пользователю 👤 ${displayName}:`, { reply_markup: cancelInputKeyboard() });
    return;
  }

  if (data.startsWith("admin:subbal:")) {
    const parts = data.split(":");
    const telegramId = parseInt(parts[2], 10);
    const fromPage = parseInt(parts[3], 10) || 0;
    if (isNaN(telegramId)) return;
    const user = getUser(telegramId);
    const displayName = user?.first_name || (user?.username ? `@${user.username}` : String(telegramId));
    adminInputState.set(ctx.from!.id, { type: "subbal", data: { telegramId, fromPage }, returnTo: `admin:user:${telegramId}:${fromPage}`, createdAt: Date.now() });
    await ctx.editMessageText(`Введите сумму для списания (в рублях) у пользователя 👤 ${displayName}:`, { reply_markup: cancelInputKeyboard() });
    return;
  }

  if (data.startsWith("admin:block:")) {
    const parts = data.split(":");
    const telegramId = parseInt(parts[2], 10);
    const fromPage = parseInt(parts[3], 10) || 0;
    if (isNaN(telegramId)) return;
    const user = getUser(telegramId);
    if (user) {
      const newBlocked = !user.is_blocked;
      setBlocked(telegramId, newBlocked);
      console.log("Admin", ctx.from!.id, newBlocked ? "blocked" : "unblocked", "user:", telegramId);
      await showUserDetail(ctx, telegramId, fromPage);
    }
    return;
  }

  if (data === "admin:stats") {
    await showStats(ctx);
    return;
  }

  if (data === "admin:del_msg") {
    await ctx.deleteMessage().catch(() => {});
    return;
  }

  if (data.startsWith("admin:gen_detail:")) {
    const parts = data.split(":");
    const genId = parseInt(parts[2], 10);
    const fromPage = parseInt(parts[3], 10) || 0;
    if (isNaN(genId)) return;
    await showGenerationDetail(ctx, genId, fromPage);
    return;
  }

  if (data.startsWith("admin:view_imgs:")) {
    const parts = data.split(":");
    const genId = parseInt(parts[2], 10);
    const fromPage = parseInt(parts[3], 10) || 0;
    if (isNaN(genId)) return;
    await viewGenerationImages(ctx, genId, fromPage);
    return;
  }

  if (data.startsWith("admin:del_imgs:")) {
    // callback format: admin:del_imgs:{genId}:{msgId1},{msgId2},...:{fromPage}
    const parts = data.split(":");
    const genId = parseInt(parts[2], 10);
    const msgIds = parts[3]?.split(",").map(Number).filter(n => !isNaN(n)) ?? [];
    const fromPage = parseInt(parts[4], 10) || 0;
    for (const msgId of msgIds) {
      await ctx.api.deleteMessage(ctx.chat!.id, msgId).catch(() => {});
    }
    await ctx.deleteMessage().catch(() => {});
    await sendGenerationDetail(ctx, genId, fromPage);
    return;
  }

  if (data.startsWith("admin:recent_gens")) {
    const page = parseInt(data.split(":")[2] ?? "0", 10);
    await showRecentGenerations(ctx, isNaN(page) ? 0 : page);
    return;
  }

  if (data.startsWith("admin:recent_pays")) {
    const page = parseInt(data.split(":")[2] ?? "0", 10);
    await showRecentPayments(ctx, isNaN(page) ? 0 : page);
    return;
  }

  if (data === "admin:settings") {
    await showSettings(ctx);
    return;
  }

  if (data === "admin:set:generation_price") {
    adminInputState.set(ctx.from!.id, { type: "set_price", returnTo: "admin:settings", createdAt: Date.now() });
    await ctx.editMessageText("Введите новую цену генерации (в рублях):", { reply_markup: cancelInputKeyboard() });
    return;
  }

  if (data === "admin:set:welcome_balance") {
    adminInputState.set(ctx.from!.id, { type: "set_welcome", returnTo: "admin:settings", createdAt: Date.now() });
    await ctx.editMessageText("Введите приветственный баланс для новых пользователей (в рублях):", { reply_markup: cancelInputKeyboard() });
    return;
  }

  if (data === "admin:broadcast") {
    adminInputState.set(ctx.from!.id, { type: "broadcast", returnTo: "admin:menu", createdAt: Date.now() });
    await ctx.editMessageText("Отправьте сообщение для рассылки — текст, фото или документ (будет отправлено всем пользователям):", { reply_markup: cancelInputKeyboard() });
    return;
  }
}

// --- Admin text input handler ---

export async function handleAdminTextInput(ctx: BotContext): Promise<boolean> {
  if (!isAdmin(ctx)) return false;

  const state = adminInputState.get(ctx.from!.id);
  if (!state) return false;

  const text = ctx.message?.text?.trim();
  if (!text) return false;

  const returnTo = state.returnTo;
  adminInputState.delete(ctx.from!.id);

  const backKeyboard = () => new InlineKeyboard().text("🔙 Назад", returnTo);

  switch (state.type) {
    case "addbal": {
      const amount = parseFloat(text);
      if (isNaN(amount) || amount <= 0 || amount > 10_000 || !/^\d+(\.\d{1,2})?$/.test(text)) {
        await ctx.reply("Некорректная сумма (макс. 10 000 ₽).", { reply_markup: backKeyboard() });
        return true;
      }
      const telegramId = state.data!.telegramId as number;
      addBalance(telegramId, Math.round(amount * 100));
      console.log("Admin", ctx.from!.id, "added", amount, "RUB to user:", telegramId);
      const user = getUser(telegramId);
      const displayName = user?.first_name || (user?.username ? `@${user.username}` : String(telegramId));
      await ctx.reply(
        `Начислено ${amount} ₽ пользователю 👤 ${displayName}.\nНовый баланс: ${Math.floor((user?.balance ?? 0) / 100)} ₽`,
        { reply_markup: backKeyboard() },
      );
      return true;
    }

    case "subbal": {
      const amount = parseFloat(text);
      if (isNaN(amount) || amount <= 0 || amount > 10_000 || !/^\d+(\.\d{1,2})?$/.test(text)) {
        await ctx.reply("Некорректная сумма (макс. 10 000 ₽).", { reply_markup: backKeyboard() });
        return true;
      }
      const telegramId = state.data!.telegramId as number;
      addBalance(telegramId, -Math.round(amount * 100));
      console.log("Admin", ctx.from!.id, "subtracted", amount, "RUB from user:", telegramId);
      const user = getUser(telegramId);
      const displayName = user?.first_name || (user?.username ? `@${user.username}` : String(telegramId));
      await ctx.reply(
        `Списано ${amount} ₽ у пользователя 👤 ${displayName}.\nНовый баланс: ${Math.floor((user?.balance ?? 0) / 100)} ₽`,
        { reply_markup: backKeyboard() },
      );
      return true;
    }

    case "set_price": {
      const price = parseFloat(text);
      if (isNaN(price) || price < 0 || !/^\d+(\.\d{1,2})?$/.test(text)) {
        await ctx.reply("Некорректная цена.", { reply_markup: backKeyboard() });
        return true;
      }
      setSetting("generation_price", String(Math.round(price * 100)));
      console.log("Admin", ctx.from!.id, "set generation_price:", price, "RUB");
      await ctx.reply(`Цена генерации установлена: ${price} ₽`, { reply_markup: backKeyboard() });
      return true;
    }

    case "set_welcome": {
      const balance = parseFloat(text);
      if (isNaN(balance) || balance < 0 || !/^\d+(\.\d{1,2})?$/.test(text)) {
        await ctx.reply("Некорректная сумма.", { reply_markup: backKeyboard() });
        return true;
      }
      setSetting("welcome_balance", String(Math.round(balance * 100)));
      console.log("Admin", ctx.from!.id, "set welcome_balance:", balance, "RUB");
      await ctx.reply(`Приветственный баланс установлен: ${balance} ₽`, { reply_markup: backKeyboard() });
      return true;
    }

    case "goto_page": {
      const pageNum = parseInt(text, 10);
      const callbackPrefix = state.data!.callbackPrefix as string;
      if (isNaN(pageNum) || pageNum < 1) {
        await ctx.reply("Некорректный номер страницы.", { reply_markup: backKeyboard() });
        return true;
      }
      const page = pageNum - 1;
      if (callbackPrefix.includes("users")) {
        await showUserList(ctx, page, true);
      } else if (callbackPrefix.includes("recent_gens")) {
        await showRecentGenerations(ctx, page, true);
      } else if (callbackPrefix.includes("recent_pays")) {
        await showRecentPayments(ctx, page, true);
      } else {
        await ctx.reply("Неизвестный раздел.", { reply_markup: backKeyboard() });
      }
      return true;
    }

    case "broadcast": {
      await handleBroadcast(ctx, text);
      // Keep broadcast state active for multiple messages
      adminInputState.set(ctx.from!.id, { type: "broadcast", returnTo: "admin:menu", createdAt: Date.now() });
      return true;
    }
  }

  return false;
}

// --- Admin media input handler (photos, documents, etc.) ---

export async function handleAdminMediaInput(ctx: BotContext): Promise<boolean> {
  if (!isAdmin(ctx)) return false;

  const state = adminInputState.get(ctx.from!.id);
  if (!state) return false;

  if (state.type === "broadcast") {
    const fromChatId = ctx.chat!.id;
    const messageId = ctx.message!.message_id;
    await broadcastToAll(ctx, (telegramId) =>
      ctx.api.copyMessage(telegramId, fromChatId, messageId),
    );
    return true;
  }

  // Non-broadcast input states expect text
  await ctx.reply("Ожидается текстовое сообщение. Отправьте текст или нажмите Назад для отмены.", {
    reply_markup: cancelInputKeyboard(),
  });
  return true;
}

// --- Screens ---

async function showUserList(ctx: BotContext, page: number, send = false): Promise<void> {
  const offset = page * USERS_PER_PAGE;
  const users = listUsers(offset, USERS_PER_PAGE);
  const total = getUserCount();
  const totalPages = Math.ceil(total / USERS_PER_PAGE);

  let text = `👥 Пользователи (${total})\n\n`;

  if (users.length === 0) {
    text += "Пользователей пока нет.";
  } else {
    text += users.map((u: UserWithStats) => {
      const status = u.is_blocked ? "🔴" : "🟢";
      const name = u.username ? `@${u.username}` : (u.first_name ?? String(u.telegram_id));
      const balance = Math.floor(u.balance / 100);
      return `${status} ${name} | ${balance}₽ | ${u.generation_count} ген.`;
    }).join("\n");
  }

  const keyboard = new InlineKeyboard();

  // User buttons
  for (const u of users) {
    const status = u.is_blocked ? "🔴" : "🟢";
    const name = u.username ? `@${u.username}` : (u.first_name ?? String(u.telegram_id));
    keyboard.text(`${status} ${name}`, `admin:user:${u.telegram_id}:${page}`).row();
  }

  // Pagination
  addPaginationRow(keyboard, page, totalPages, "admin:users:");
  keyboard.text("🔙 Назад", "admin:menu");
  if (send) {
    await ctx.reply(text, { reply_markup: keyboard });
  } else {
    await ctx.editMessageText(text, { reply_markup: keyboard });
  }
}

async function showUserDetail(ctx: BotContext, telegramId: number, fromPage = 0): Promise<void> {
  const user = getUser(telegramId);
  if (!user) {
    await ctx.editMessageText("Пользователь не найден.", { reply_markup: new InlineKeyboard().text("🔙 Назад", `admin:users:${fromPage}`) });
    return;
  }

  const name = user.username ? `@${user.username}` : (user.first_name ?? String(user.telegram_id));
  const balance = Math.floor(user.balance / 100);
  const blocked = user.is_blocked ? "🔴 Заблокирован" : "🟢 Активен";

  const text = `👤 ${name}
ID: ${user.telegram_id}
Баланс: ${balance} ₽
Статус: ${blocked}
Регистрация: ${formatDateMoscow(user.created_at)}
Активность: ${formatDateMoscow(user.last_active)}`;

  const keyboard = new InlineKeyboard()
    .url("💬 Написать", `tg://user?id=${telegramId}`).row()
    .text("➕ Начислить", `admin:addbal:${telegramId}:${fromPage}`)
    .text("➖ Списать", `admin:subbal:${telegramId}:${fromPage}`).row()
    .text(user.is_blocked ? "✅ Разблокировать" : "🚫 Заблокировать", `admin:block:${telegramId}:${fromPage}`).row()
    .text("🔙 Назад", `admin:users:${fromPage}`);

  await ctx.editMessageText(text, { reply_markup: keyboard });
}

async function showStats(ctx: BotContext): Promise<void> {
  const genStats = getGenerationStats();
  const payStats = getPaymentStats();
  const totalUsers = getUserCount();
  const activeToday = getActiveUsersCount(1);
  const activeWeek = getActiveUsersCount(7);

  const revenueTotal = Math.floor(genStats.revenue / 100);
  const revenueToday = Math.floor(genStats.revenue_today / 100);
  const revenueWeek = Math.floor(genStats.revenue_week / 100);
  const costTotal = Math.floor(genStats.actual_cost_total / 100);
  const payTotal = Math.floor(payStats.total_revenue / 100);
  const payToday = Math.floor(payStats.today_revenue / 100);

  const text = `📊 Статистика

👥 Пользователи:
• Всего: ${totalUsers}
• Активных сегодня: ${activeToday}
• Активных за неделю: ${activeWeek}

🖼️ Генерации:
• Всего: ${genStats.total}
• Сегодня: ${genStats.today}
• За неделю: ${genStats.week}

💰 Доход (генерации):
• Всего: ${revenueTotal} ₽
• Сегодня: ${revenueToday} ₽
• За неделю: ${revenueWeek} ₽
• Себестоимость API: ${costTotal} ₽
• Маржа: ${revenueTotal - costTotal} ₽

💳 Платежи:
• Всего: ${payStats.total_count} на ${payTotal} ₽
• Сегодня: ${payStats.today_count} на ${payToday} ₽`;

  await ctx.editMessageText(text, { reply_markup: backToAdminKeyboard() });
}

async function showRecentGenerations(ctx: BotContext, page: number, send = false): Promise<void> {
  const offset = page * USERS_PER_PAGE;
  const gens = getRecentGenerations(USERS_PER_PAGE, offset);
  const total = getGenerationCount();
  const totalPages = Math.ceil(total / USERS_PER_PAGE);

  let text = `🖼️ Генерации (${total})\n\n`;

  const numberEmojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];

  if (gens.length === 0) {
    text += "Генераций пока нет.";
  } else {
    text += gens.map((g, i) => {
      const num = numberEmojis[i] ?? `${i + 1}.`;
      const name = g.username ? `@${g.username}` : String(g.user_id);
      const cost = Math.floor(g.cost / 100);
      const prompt = g.user_prompt ? g.user_prompt.substring(0, 50) : "—";
      const statusText = g.status === "completed" ? "✅ Готово" : "❌ Ошибка";
      return `${num} ${formatDateMoscow(g.created_at)}\n${name} | ${cost}₽ | ${statusText}\n${prompt}`;
    }).join("\n\n");
  }

  const keyboard = new InlineKeyboard();

  // One button per generation leading to detail view
  for (let i = 0; i < gens.length; i++) {
    const g = gens[i];
    const num = numberEmojis[i] ?? `${i + 1}.`;
    const label = g.user_prompt ? g.user_prompt.substring(0, 25) : `#${g.id}`;
    keyboard.text(`${num} ${label}`, `admin:gen_detail:${g.id}:${page}`).row();
  }

  addPaginationRow(keyboard, page, totalPages, "admin:recent_gens:");
  keyboard.text("🔙 Назад", "admin:menu");

  if (send) {
    await ctx.reply(text, { reply_markup: keyboard });
  } else {
    await ctx.editMessageText(text, { reply_markup: keyboard });
  }
}

async function showRecentPayments(ctx: BotContext, page: number, send = false): Promise<void> {
  const offset = page * USERS_PER_PAGE;
  const pays = getRecentPayments(USERS_PER_PAGE, offset);
  const total = getPaymentCount();
  const totalPages = Math.ceil(total / USERS_PER_PAGE);

  let text = `💳 Платежи (${total})\n\n`;

  if (pays.length === 0) {
    text += "Платежей пока нет.";
  } else {
    text += pays.map((p) => {
      const name = p.username ? `@${p.username}` : String(p.user_id);
      const amount = Math.floor(p.amount / 100);
      const statusMap: Record<string, string> = { succeeded: "✅ Оплачен", pending: "⏳ Ожидание", canceled: "❌ Отменён" };
      const statusText = statusMap[p.status] ?? p.status;
      return `${formatDateMoscow(p.created_at)}\n${name} | ${amount}₽ | ${statusText}`;
    }).join("\n\n");
  }

  const keyboard = new InlineKeyboard();
  addPaginationRow(keyboard, page, totalPages, "admin:recent_pays:");
  keyboard.text("🔙 Назад", "admin:menu");

  if (send) {
    await ctx.reply(text, { reply_markup: keyboard });
  } else {
    await ctx.editMessageText(text, { reply_markup: keyboard });
  }
}

function buildGenerationDetail(genId: number, fromPage = 0): { text: string; keyboard: InlineKeyboard } | null {
  const gen = getGeneration(genId);
  if (!gen) return null;

  const user = getUser(gen.user_id);
  const name = user?.username ? `@${user.username}` : (user?.first_name ?? String(gen.user_id));
  const cost = Math.floor(gen.cost / 100);
  const statusText = gen.status === "completed" ? "✅ Готово" : "❌ Ошибка";

  const text = `📅 ${formatDateMoscow(gen.created_at)}
${name} | ${cost}₽ | ${statusText}
${gen.user_prompt ?? "—"}`;

  const keyboard = new InlineKeyboard();
  if (gen.source_file_id || gen.result_file_id) keyboard.text("🎨 Посмотреть исходник и результат", `admin:view_imgs:${gen.id}:${fromPage}`).row();
  keyboard.text("🔙 Назад", `admin:recent_gens:${fromPage}`);

  return { text, keyboard };
}

async function showGenerationDetail(ctx: BotContext, genId: number, fromPage = 0): Promise<void> {
  const detail = buildGenerationDetail(genId, fromPage);
  if (!detail) {
    await ctx.editMessageText("Генерация не найдена.", { reply_markup: new InlineKeyboard().text("🔙 Назад", `admin:recent_gens:${fromPage}`) });
    return;
  }
  await ctx.editMessageText(detail.text, { reply_markup: detail.keyboard });
}

async function sendGenerationDetail(ctx: BotContext, genId: number, fromPage = 0): Promise<void> {
  const detail = buildGenerationDetail(genId, fromPage);
  if (!detail) {
    await ctx.reply("Генерация не найдена.", { reply_markup: new InlineKeyboard().text("🔙 Назад", `admin:recent_gens:${fromPage}`) });
    return;
  }
  await ctx.reply(detail.text, { reply_markup: detail.keyboard });
}

async function sendFileAuto(ctx: BotContext, fileId: string, caption: string, keyboard?: InlineKeyboard) {
  try {
    return await ctx.replyWithPhoto(fileId, { caption, reply_markup: keyboard });
  } catch {
    return await ctx.replyWithDocument(fileId, { caption, reply_markup: keyboard });
  }
}

async function viewGenerationImages(ctx: BotContext, genId: number, fromPage = 0): Promise<void> {
  const gen = getGeneration(genId);
  if (!gen) {
    await ctx.answerCallbackQuery({ text: "Генерация не найдена" });
    return;
  }

  if (!gen.source_file_id && !gen.result_file_id) {
    await ctx.answerCallbackQuery({ text: "Файлы не найдены" });
    return;
  }

  await ctx.deleteMessage().catch(() => {});

  const sentMsgIds: number[] = [];

  if (gen.source_file_id) {
    const sent = await sendFileAuto(ctx, gen.source_file_id, `📎 Исходник`);
    sentMsgIds.push(sent.message_id);
  }

  if (gen.result_file_id) {
    const sent = await sendFileAuto(ctx, gen.result_file_id, `🎨 Результат`);
    sentMsgIds.push(sent.message_id);
  }

  const msgIds = sentMsgIds.join(",");
  const keyboard = new InlineKeyboard().text("🔙 Назад", `admin:del_imgs:${gen.id}:${msgIds}:${fromPage}`);
  const prompt = gen.user_prompt ? gen.user_prompt.substring(0, 200) : `Генерация #${gen.id}`;
  await ctx.reply(prompt, { reply_markup: keyboard });
}

async function showSettings(ctx: BotContext): Promise<void> {
  const price = Math.floor(getGenerationPrice() / 100);
  const welcome = Math.floor(getWelcomeBalance() / 100);
  const text = `⚙️ Настройки

Цена генерации: ${price} ₽
Приветственный баланс: ${welcome} ₽`;

  const keyboard = new InlineKeyboard()
    .text(`💰 Цена: ${price}₽`, "admin:set:generation_price").row()
    .text(`🎁 Приветственный: ${welcome}₽`, "admin:set:welcome_balance").row()
    .text("🔙 Назад", "admin:menu");

  await ctx.editMessageText(text, { reply_markup: keyboard });
}

const MAX_BROADCAST_LENGTH = 4096; // Telegram message limit

async function broadcastToAll(
  ctx: BotContext,
  sendFn: (telegramId: number) => Promise<unknown>,
): Promise<void> {
  let sent = 0;
  let failed = 0;
  let offset = 0;
  const batchSize = 100;

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  // Process users in batches to avoid loading all into memory
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const users = listUsers(offset, batchSize);
    if (users.length === 0) break;

    for (const user of users) {
      if (user.is_blocked) continue;
      try {
        await sendFn(user.telegram_id);
        sent++;
      } catch (err: unknown) {
        // Back off on Telegram rate limit (HTTP 429)
        if (err instanceof Error && err.message.includes("429")) {
          await sleep(5000);
          try {
            await sendFn(user.telegram_id);
            sent++;
          } catch {
            failed++;
          }
        } else {
          failed++;
        }
      }
      // Telegram rate limit: ~25 msg/sec for different chats
      await sleep(50);
    }

    offset += batchSize;
  }

  console.log("Broadcast by admin", ctx.from!.id, "sent:", sent, "failed:", failed);
  await ctx.reply(`📢 Рассылка завершена.\nОтправлено: ${sent}\nНе доставлено: ${failed}\n\nОтправьте ещё сообщение или нажмите Назад.`, {
    reply_markup: cancelInputKeyboard(),
  });
}

async function handleBroadcast(ctx: BotContext, message: string): Promise<void> {
  if (message.length > MAX_BROADCAST_LENGTH) {
    await ctx.reply(`Сообщение слишком длинное (${message.length} символов, макс. ${MAX_BROADCAST_LENGTH}).`, {
      reply_markup: backToAdminKeyboard(),
    });
    return;
  }

  await broadcastToAll(ctx, (telegramId) => ctx.api.sendMessage(telegramId, message));
}

function addPaginationRow(keyboard: InlineKeyboard, page: number, totalPages: number, callbackPrefix: string): void {
  if (totalPages <= 1) return;
  keyboard.text(page > 0 ? "« 1" : "·", page > 0 ? `${callbackPrefix}0` : "admin:noop");
  keyboard.text(page > 0 ? "⬅️" : "·", page > 0 ? `${callbackPrefix}${page - 1}` : "admin:noop");
  keyboard.text(`${page + 1} / ${totalPages}`, `admin:goto:${callbackPrefix}${page}`);
  keyboard.text(page < totalPages - 1 ? "➡️" : "·", page < totalPages - 1 ? `${callbackPrefix}${page + 1}` : "admin:noop");
  keyboard.text(page < totalPages - 1 ? `${totalPages} »` : "·", page < totalPages - 1 ? `${callbackPrefix}${totalPages - 1}` : "admin:noop");
  keyboard.row();
}

function cancelInputKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text("🔙 Назад", "admin:cancel_input");
}

function backToAdminKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text("🔙 Назад", "admin:menu");
}
