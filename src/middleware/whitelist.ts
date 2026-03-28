import { Context, NextFunction } from "grammy";
import { config } from "../config.js";

export async function whitelist(ctx: Context, next: NextFunction): Promise<void> {
  const userId = ctx.from?.id;
  const username = ctx.from?.username?.toLowerCase();

  const byId = userId && config.allowedUserIds.includes(userId);
  const byUsername = username && config.allowedUsernames.includes(username);

  if (!byId && !byUsername) {
    return; // silent ignore
  }
  await next();
}
