import { describe, expect, it } from "vitest";
import { createMeterBudget } from "./meter-budget";

describe("Meter runtime budget", () => {
  it("caps concurrent work and releases slots exactly once", () => {
    const budget = createMeterBudget();
    const slots = Array.from({ length: 4 }, () => budget.acquire());
    expect(budget.acquire()).toMatchObject({ allowed: false, status: 503 });
    if (!slots[0].allowed) throw new Error("first request rejected");
    slots[0].release();
    slots[0].release();
    expect(budget.acquire().allowed).toBe(true);
    expect(budget.acquire()).toMatchObject({ allowed: false, status: 503 });
  });

  it("caps completed requests and resets the window", () => {
    let now = 0;
    const budget = createMeterBudget(() => now);
    for (let i = 0; i < 30; i++) {
      const slot = budget.acquire();
      if (!slot.allowed) throw new Error("early rejection");
      slot.release();
    }
    expect(budget.acquire()).toMatchObject({ allowed: false, status: 429, retryAfter: 60 });
    now = 60_000;
    expect(budget.acquire().allowed).toBe(true);
  });
});
