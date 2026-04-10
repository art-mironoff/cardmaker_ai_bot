import { describe, it, expect, beforeEach, vi } from "vitest";

vi.useFakeTimers();

const { checkRateLimit } = await import("../../src/middleware/rateLimit.js");

describe("middleware/rateLimit", () => {
  beforeEach(() => {
    vi.setSystemTime(new Date("2024-01-01T00:00:00Z"));
  });

  it("allows up to 5 requests per minute", () => {
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit(100)).toBe(true);
    }
  });

  it("rejects 6th request within the same minute", () => {
    for (let i = 0; i < 5; i++) {
      checkRateLimit(100);
    }
    expect(checkRateLimit(100)).toBe(false);
  });

  it("tracks users independently", () => {
    // Use up user 100's quota
    for (let i = 0; i < 5; i++) {
      checkRateLimit(100);
    }
    expect(checkRateLimit(100)).toBe(false);

    // User 200 should still have quota
    expect(checkRateLimit(200)).toBe(true);
  });

  it("allows requests after window expires", () => {
    // Use up quota
    for (let i = 0; i < 5; i++) {
      checkRateLimit(100);
    }
    expect(checkRateLimit(100)).toBe(false);

    // Advance 61 seconds — all timestamps should expire
    vi.advanceTimersByTime(61_000);

    expect(checkRateLimit(100)).toBe(true);
  });

  it("sliding window allows gradual recovery", () => {
    // Fire 5 requests at t=0
    for (let i = 0; i < 5; i++) {
      checkRateLimit(100);
    }
    expect(checkRateLimit(100)).toBe(false);

    // Advance 30 seconds — still within window
    vi.advanceTimersByTime(30_000);
    expect(checkRateLimit(100)).toBe(false);

    // Advance another 31 seconds (total 61s) — first batch expired
    vi.advanceTimersByTime(31_000);
    expect(checkRateLimit(100)).toBe(true);
  });
});
