import { NextFunction } from "grammy";
import { BotContext } from "../context.js";
import { getUser, getOrCreateUser } from "../db/users.js";

export async function auth(ctx: BotContext, next: NextFunction): Promise<void> {
  const from = ctx.from;
  if (!from) return;

  const existing = getUser(from.id);
  ctx.dbUser = getOrCreateUser(from.id, from.username ?? undefined, from.first_name ?? undefined);
  if (!existing) {
    console.log("New user registered:", from.id, from.username ?? "no-username");
  }
  await next();
}
