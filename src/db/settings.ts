import { getDb } from "./index.js";

export function getSetting(key: string): string | null {
  const row = getDb()
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  getDb()
    .prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?")
    .run(key, value, value);
}

export function getGenerationPrice(): number {
  return Number(getSetting("generation_price") ?? "5000");
}

export function getWelcomeBalance(): number {
  return Number(getSetting("welcome_balance") ?? "0");
}

export function isConsentRequired(): boolean {
  return getSetting("require_consent") === "true";
}
