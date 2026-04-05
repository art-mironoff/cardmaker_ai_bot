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
  yookassa: {
    shopId: process.env.YOOKASSA_SHOP_ID ?? "",
    secretKey: process.env.YOOKASSA_SECRET_KEY ?? "",
    returnUrl: process.env.YOOKASSA_RETURN_URL ?? "",
    notificationSecret: process.env.YOOKASSA_NOTIFICATION_SECRET ?? "",
  },
  webhookPort: Number(process.env.WEBHOOK_PORT ?? "3000"),
  webhookBaseUrl: process.env.WEBHOOK_BASE_URL ?? "",
} as const;
