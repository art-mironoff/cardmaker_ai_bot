import { Context } from "grammy";
import { texts } from "../texts/index.js";
import {
  switchProvider,
  getCurrentProviderName,
} from "../providers/registry.js";

export async function handleProvider(ctx: Context): Promise<void> {
  const args = ctx.message?.text?.split(/\s+/).slice(1);
  const name = args?.[0];

  if (!name) {
    const current = getCurrentProviderName();
    if (current) {
      await ctx.reply(texts.providerCurrent(current) + "\n" + texts.providerUsage);
    } else {
      await ctx.reply(texts.providerUsage);
    }
    return;
  }

  if (switchProvider(name)) {
    await ctx.reply(texts.providerSwitched(name));
  } else {
    await ctx.reply(texts.providerNotFound(name));
  }
}
