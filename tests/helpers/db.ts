import Database from "better-sqlite3";

/**
 * Creates an in-memory SQLite database with the full application schema.
 * Mirrors the schema from src/db/index.ts.
 */
export function createTestDb(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      telegram_id INTEGER PRIMARY KEY,
      username TEXT,
      first_name TEXT,
      balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
      is_blocked INTEGER NOT NULL DEFAULT 0,
      consent_given INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_active TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS generations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(telegram_id),
      cost INTEGER NOT NULL CHECK (cost >= 0),
      actual_cost INTEGER,
      provider TEXT NOT NULL,
      format TEXT,
      user_prompt TEXT,
      source_file_id TEXT,
      result_file_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_generations_user_id ON generations(user_id);
    CREATE INDEX IF NOT EXISTS idx_generations_created_at ON generations(created_at);

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(telegram_id),
      amount INTEGER NOT NULL CHECK (amount > 0),
      status TEXT NOT NULL DEFAULT 'pending',
      external_id TEXT UNIQUE,
      confirmation_url TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
    CREATE INDEX IF NOT EXISTS idx_payments_external_id ON payments(external_id);
    CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at);

    CREATE INDEX IF NOT EXISTS idx_users_last_active ON users(last_active);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    INSERT OR IGNORE INTO settings (key, value) VALUES ('generation_price', '5000');
    INSERT OR IGNORE INTO settings (key, value) VALUES ('welcome_balance', '0');
    INSERT OR IGNORE INTO settings (key, value) VALUES ('min_topup', '5000');
    INSERT OR IGNORE INTO settings (key, value) VALUES ('require_consent', 'false');
  `);

  return db;
}
