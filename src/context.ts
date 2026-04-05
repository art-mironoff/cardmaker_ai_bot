import { Context } from "grammy";
import type { DbUser } from "./db/users.js";

export interface BotContext extends Context {
  dbUser: DbUser;
}
