const MAX_GENERATIONS_PER_MINUTE = 5;
const WINDOW_MS = 60 * 1000;

// Map of userId -> array of timestamps
const generationTimestamps = new Map<number, number[]>();

export function checkRateLimit(userId: number): boolean {
  const now = Date.now();
  const timestamps = generationTimestamps.get(userId) ?? [];

  // Remove expired timestamps
  const active = timestamps.filter((t) => now - t < WINDOW_MS);

  if (active.length >= MAX_GENERATIONS_PER_MINUTE) {
    generationTimestamps.set(userId, active);
    return false;
  }

  active.push(now);
  generationTimestamps.set(userId, active);
  return true;
}

// Cleanup stale entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [userId, timestamps] of generationTimestamps) {
    const active = timestamps.filter((t) => now - t < WINDOW_MS);
    if (active.length === 0) {
      generationTimestamps.delete(userId);
    } else {
      generationTimestamps.set(userId, active);
    }
  }
}, 5 * 60 * 1000);
