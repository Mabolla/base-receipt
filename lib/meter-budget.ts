/** Best-effort per-runtime budget, not a distributed or per-person quota. */
export function createMeterBudget(now = Date.now) {
  let resetAt = now() + 60_000;
  let count = 0;
  let active = 0;
  return {
    acquire() {
      const timestamp = now();
      if (timestamp >= resetAt) { resetAt = timestamp + 60_000; count = 0; }
      if (count >= 30) return { allowed: false as const, status: 429, retryAfter: Math.max(1, Math.ceil((resetAt - timestamp) / 1000)) };
      if (active >= 4) return { allowed: false as const, status: 503, retryAfter: 5 };
      count++;
      active++;
      let released = false;
      return { allowed: true as const, release() { if (!released) { active--; released = true; } } };
    },
  };
}
