import { getDb } from "./index.js";

export interface DbPayment {
  id: number;
  user_id: number;
  amount: number;
  status: string;
  external_id: string | null;
  confirmation_url: string | null;
  created_at: string;
}

export function createPayment(userId: number, amount: number): number {
  const result = getDb()
    .prepare("INSERT INTO payments (user_id, amount) VALUES (?, ?)")
    .run(userId, amount);
  return Number(result.lastInsertRowid);
}

export function updatePaymentStatus(
  id: number,
  status: string,
  externalId?: string,
  confirmationUrl?: string,
): void {
  getDb()
    .prepare(
      "UPDATE payments SET status = ?, external_id = COALESCE(?, external_id), confirmation_url = COALESCE(?, confirmation_url) WHERE id = ?",
    )
    .run(status, externalId ?? null, confirmationUrl ?? null, id);
}

export function claimAndCreditPayment(paymentId: number, userId: number, amount: number): boolean {
  const db = getDb();
  const tx = db.transaction(() => {
    const result = db
      .prepare("UPDATE payments SET status = 'succeeded' WHERE id = ? AND status = 'pending'")
      .run(paymentId);
    if (result.changes === 0) return false;
    db.prepare("UPDATE users SET balance = balance + ? WHERE telegram_id = ?")
      .run(amount, userId);
    return true;
  });
  return tx();
}

export function getPaymentByExternalId(externalId: string): DbPayment | undefined {
  return getDb()
    .prepare("SELECT * FROM payments WHERE external_id = ?")
    .get(externalId) as DbPayment | undefined;
}

export function getPaymentById(id: number): DbPayment | undefined {
  return getDb()
    .prepare("SELECT * FROM payments WHERE id = ?")
    .get(id) as DbPayment | undefined;
}

export function getRecentPayments(limit: number, offset = 0): (DbPayment & { username: string | null })[] {
  return getDb()
    .prepare(
      `SELECT p.*, u.username
       FROM payments p
       JOIN users u ON u.telegram_id = p.user_id
       ORDER BY p.created_at DESC
       LIMIT ? OFFSET ?`,
    )
    .all(limit, offset) as (DbPayment & { username: string | null })[];
}

export function getPaymentCount(): number {
  const row = getDb().prepare("SELECT COUNT(*) as count FROM payments").get() as { count: number };
  return row.count;
}

export interface PaymentStats {
  total_revenue: number;
  total_count: number;
  today_revenue: number;
  today_count: number;
}

export function getPaymentStats(): PaymentStats {
  const db = getDb();

  const total = db.prepare(
    "SELECT COALESCE(SUM(amount), 0) as revenue, COUNT(*) as count FROM payments WHERE status = 'succeeded'",
  ).get() as { revenue: number; count: number };

  const today = db.prepare(
    "SELECT COALESCE(SUM(amount), 0) as revenue, COUNT(*) as count FROM payments WHERE status = 'succeeded' AND created_at >= datetime('now', 'start of day')",
  ).get() as { revenue: number; count: number };

  return {
    total_revenue: total.revenue,
    total_count: total.count,
    today_revenue: today.revenue,
    today_count: today.count,
  };
}
