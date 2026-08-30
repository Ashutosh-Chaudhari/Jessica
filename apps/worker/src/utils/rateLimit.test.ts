// Run: npm test   (node --test, no framework)
import { test } from "node:test";
import assert from "node:assert/strict";
import { ESTIMATED_CALLS_PER_REQUEST, enforceDailyBudget, type BudgetContext } from "./rateLimit.ts";
import { ApiFailure } from "./failure.ts";

/**
 * Stands in for reserve_ai_calls. The real one is a single UPDATE guarded by a
 * row lock; the counter below is incremented without yielding, which is the
 * same guarantee - a caller either sees the increment or has not run yet.
 */
function fakeBudget(dailyBudget: number, alreadyUsed = 0) {
  let used = alreadyUsed;
  const claims: Array<[number, number]> = [];
  const ctx: BudgetContext = {
    dailyBudget,
    reserved: 0,
    repo: {
      reserveAiCalls: async (calls: number, budget: number) => {
        claims.push([calls, budget]);
        if (used + calls > budget) return false;
        used += calls;
        return true;
      },
    },
  };
  return { ctx, claims, spent: () => used };
}

test("the budget allows a request while the day can still afford it", async () => {
  const { ctx, spent } = fakeBudget(800, 796);
  await enforceDailyBudget(ctx); // must not throw
  assert.equal(spent(), 798);
  assert.equal(ctx.reserved, ESTIMATED_CALLS_PER_REQUEST, "what it claimed must be settleable");
});

test("the budget stops at the ceiling, not one past it", async () => {
  const { ctx, spent } = fakeBudget(800, 799);
  await assert.rejects(enforceDailyBudget(ctx), (e: unknown) => {
    assert.ok(e instanceof ApiFailure);
    // The user must get the polite stop, never a provider error.
    assert.equal(e.code, "daily_limit_reached");
    return true;
  });
  assert.equal(spent(), 799, "a refused claim charges nothing");
  assert.equal(ctx.reserved, 0, "and leaves nothing to settle");
});

test("a budget of 0 disables the cap entirely", async () => {
  const { ctx, claims } = fakeBudget(0, 999999);
  await enforceDailyBudget(ctx);
  assert.equal(claims.length, 0, "disabled means it does not even ask");
});

test("the claim is made up front, so it holds when requests arrive together", async () => {
  // The regression this replaces: the budget used to COUNT ai_usage rows, which
  // are only written after the response. Fired concurrently, every request read
  // the same stale total and every one of them passed. Here 50 requests race
  // for a budget of 20 - room for exactly 10 of them.
  const { ctx, spent } = fakeBudget(20);
  const outcomes = await Promise.allSettled(
    Array.from({ length: 50 }, () => enforceDailyBudget(ctx)),
  );

  const granted = outcomes.filter((o) => o.status === "fulfilled").length;
  assert.equal(granted, 10, "the ceiling binds no matter how the requests arrive");
  assert.equal(spent(), 20);
  assert.equal(ctx.reserved, 20, "every granted claim is accounted for");
  for (const outcome of outcomes) {
    if (outcome.status === "rejected") {
      assert.equal((outcome.reason as ApiFailure).code, "daily_limit_reached");
    }
  }
});
