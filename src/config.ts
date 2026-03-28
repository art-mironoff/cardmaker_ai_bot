import "dotenv/config";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Отсутствует обязательная переменная окружения: ${name}`);
  }
  return value;
}

export const config = {
  botToken: requireEnv("BOT_TOKEN"),
  openrouterApiKey: requireEnv("OPENROUTER_API_KEY"),
  allowedUserIds: (process.env.ALLOWED_USER_IDS ?? "")
    .split(",")
    .map((id) => Number(id.trim()))
    .filter((id) => !isNaN(id)),
  allowedUsernames: (process.env.ALLOWED_USERNAMES ?? "")
    .split(",")
    .map((u) => u.trim().toLowerCase().replace(/^@/, ""))
    .filter((u) => u.length > 0),
} as const;
