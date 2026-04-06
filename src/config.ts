import "dotenv/config";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  botToken: requireEnv("BOT_TOKEN"),
  openrouterApiKey: requireEnv("OPENROUTER_API_KEY"),
  adminIds: (process.env.ADMIN_IDS ?? "")
    .split(",")
    .map((id) => Number(id.trim()))
    .filter((id) => !isNaN(id) && id > 0),
  yoomoney: {
    walletId: process.env.YOOMONEY_WALLET_ID ?? "",
    notificationSecret: process.env.YOOMONEY_NOTIFICATION_SECRET ?? "",
    returnUrl: process.env.PAYMENT_RETURN_URL ?? "",
  },
  webhookPort: Number(process.env.WEBHOOK_PORT ?? "3000"),
  webhookBaseUrl: process.env.WEBHOOK_BASE_URL ?? "",
} as const;
