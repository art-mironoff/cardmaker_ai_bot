import { getDb } from "./index.js";
import { getSetting } from "./settings.js";

export interface DbUser {
  telegram_id: number;
  username: string | null;
  first_name: string | null;
  balance: number;
  is_blocked: number;
  consent_given: number;
  created_at: string;
  last_active: string;
}

export function getOrCreateUser(
  telegramId: number,
  username?: string,
  firstName?: string,
): DbUser {
  const db = getDb();

  const existing = db
    .prepare("SELECT * FROM users WHERE telegram_id = ?")
    .get(telegramId) as DbUser | undefined;

  if (existing) {
    db.prepare(
      "UPDATE users SET username = ?, first_name = ?, last_active = datetime('now') WHERE telegram_id = ?",
    ).run(username ?? null, firstName ?? null, telegramId);
    return db.prepare("SELECT * FROM users WHERE telegram_id = ?").get(telegramId) as DbUser;
  }

  const welcomeBalance = Number(getSetting("welcome_balance") ?? "0");

  db.prepare(
    `INSERT INTO users (telegram_id, username, first_name, balance)
     VALUES (?, ?, ?, ?)`,
  ).run(telegramId, username ?? null, firstName ?? null, welcomeBalance);

  return db.prepare("SELECT * FROM users WHERE telegram_id = ?").get(telegramId) as DbUser;
}

export function getUser(telegramId: number): DbUser | undefined {
  return getDb()
    .prepare("SELECT * FROM users WHERE telegram_id = ?")
    .get(telegramId) as DbUser | undefined;
}

export function updateLastActive(telegramId: number): void {
  getDb()
    .prepare("UPDATE users SET last_active = datetime('now') WHERE telegram_id = ?")
    .run(telegramId);
}

export function addBalance(telegramId: number, amount: number): void {
  getDb()
    .prepare("UPDATE users SET balance = balance + ? WHERE telegram_id = ?")
    .run(amount, telegramId);
}

export function deductBalance(telegramId: number, amount: number): boolean {
  const result = getDb()
    .prepare("UPDATE users SET balance = balance - ? WHERE telegram_id = ? AND balance >= ?")
    .run(amount, telegramId, amount);
  return result.changes > 0;
}

export function setBlocked(telegramId: number, blocked: boolean): void {
  getDb()
    .prepare("UPDATE users SET is_blocked = ? WHERE telegram_id = ?")
    .run(blocked ? 1 : 0, telegramId);
}

export function setConsent(telegramId: number, given: boolean): void {
  getDb()
    .prepare("UPDATE users SET consent_given = ? WHERE telegram_id = ?")
    .run(given ? 1 : 0, telegramId);
}

export function getUserCount(): number {
  const row = getDb().prepare("SELECT COUNT(*) as count FROM users").get() as { count: number };
  return row.count;
}

export function getActiveUsersCount(days: number): number {
  const row = getDb()
    .prepare(
      "SELECT COUNT(*) as count FROM users WHERE last_active >= datetime('now', ?)",
    )
    .get(`-${days} days`) as { count: number };
  return row.count;
}

export interface UserWithStats extends DbUser {
  generation_count: number;
}

export function listUsers(offset: number, limit: number): UserWithStats[] {
  return getDb()
    .prepare(
      `SELECT u.*, COALESCE(g.cnt, 0) as generation_count
       FROM users u
       LEFT JOIN (SELECT user_id, COUNT(*) as cnt FROM generations GROUP BY user_id) g
         ON g.user_id = u.telegram_id
       ORDER BY u.last_active DESC
       LIMIT ? OFFSET ?`,
    )
    .all(limit, offset) as UserWithStats[];
}
