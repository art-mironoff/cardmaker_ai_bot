import { getDb } from "./index.js";

export interface DbGeneration {
  id: number;
  user_id: number;
  cost: number;
  actual_cost: number | null;
  provider: string;
  format: string | null;
  user_prompt: string | null;
  source_file_id: string | null;
  result_file_id: string | null;
  status: string;
  created_at: string;
}

export function createGeneration(
  userId: number,
  cost: number,
  provider: string,
  format: string | null,
  userPrompt: string | null,
  sourceFileId: string | null,
): number {
  const result = getDb()
    .prepare(
      `INSERT INTO generations (user_id, cost, provider, format, user_prompt, source_file_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(userId, cost, provider, format, userPrompt, sourceFileId);
  return Number(result.lastInsertRowid);
}

export function completeGeneration(id: number, resultFileId?: string, actualCost?: number): void {
  getDb()
    .prepare(
      "UPDATE generations SET status = 'completed', result_file_id = ?, actual_cost = ? WHERE id = ?",
    )
    .run(resultFileId ?? null, actualCost ?? null, id);
}

export function failGeneration(id: number): void {
  getDb()
    .prepare("UPDATE generations SET status = 'failed' WHERE id = ?")
    .run(id);
}

export function getGeneration(id: number): DbGeneration | null {
  return (getDb()
    .prepare("SELECT * FROM generations WHERE id = ?")
    .get(id) as DbGeneration | undefined) ?? null;
}

export function getRecentGenerations(limit: number, offset = 0): (DbGeneration & { username: string | null })[] {
  return getDb()
    .prepare(
      `SELECT g.*, u.username
       FROM generations g
       JOIN users u ON u.telegram_id = g.user_id
       ORDER BY g.created_at DESC
       LIMIT ? OFFSET ?`,
    )
    .all(limit, offset) as (DbGeneration & { username: string | null })[];
}

export function getGenerationCount(): number {
  const row = getDb().prepare("SELECT COUNT(*) as count FROM generations").get() as { count: number };
  return row.count;
}

export function getUserGenerationCount(userId: number): number {
  const row = getDb()
    .prepare("SELECT COUNT(*) as count FROM generations WHERE user_id = ?")
    .get(userId) as { count: number };
  return row.count;
}

export interface GenerationStats {
  total: number;
  today: number;
  week: number;
  revenue: number;
  revenue_today: number;
  revenue_week: number;
  actual_cost_total: number;
}

export function getGenerationStats(): GenerationStats {
  const db = getDb();

  const total = db.prepare(
    "SELECT COUNT(*) as count FROM generations WHERE status = 'completed'",
  ).get() as { count: number };

  const today = db.prepare(
    "SELECT COUNT(*) as count FROM generations WHERE status = 'completed' AND created_at >= datetime('now', 'start of day')",
  ).get() as { count: number };

  const week = db.prepare(
    "SELECT COUNT(*) as count FROM generations WHERE status = 'completed' AND created_at >= datetime('now', '-7 days')",
  ).get() as { count: number };

  const revenue = db.prepare(
    "SELECT COALESCE(SUM(cost), 0) as total FROM generations WHERE status = 'completed'",
  ).get() as { total: number };

  const revenueToday = db.prepare(
    "SELECT COALESCE(SUM(cost), 0) as total FROM generations WHERE status = 'completed' AND created_at >= datetime('now', 'start of day')",
  ).get() as { total: number };

  const revenueWeek = db.prepare(
    "SELECT COALESCE(SUM(cost), 0) as total FROM generations WHERE status = 'completed' AND created_at >= datetime('now', '-7 days')",
  ).get() as { total: number };

  const actualCost = db.prepare(
    "SELECT COALESCE(SUM(actual_cost), 0) as total FROM generations WHERE status = 'completed'",
  ).get() as { total: number };

  return {
    total: total.count,
    today: today.count,
    week: week.count,
    revenue: revenue.total,
    revenue_today: revenueToday.total,
    revenue_week: revenueWeek.total,
    actual_cost_total: actualCost.total,
  };
}
