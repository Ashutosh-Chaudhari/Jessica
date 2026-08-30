// Run: npm test   (node --test, no framework)
import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_CALLS, enforceDailyBudget, type BudgetContext } from "./rateLimit.ts";
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
  const { ctx, spent } = fakeBudget(800, 780);
  await enforceDailyBudget(ctx, MAX_CALLS.start); // must not throw
  assert.equal(spent(), 796);
  assert.equal(ctx.reserved, MAX_CALLS.start, "what it claimed must be settleable");
});

test("a route claims its worst case, not its typical cost", async () => {
  // Admission is decided by the claim, and the overrun is only discovered once
  // the calls have been made - so claiming low is the one way past the ceiling.
  // start can reach 5 * (generate + retry + embed) + a fallback embed.
  assert.equal(MAX_CALLS.start, 16);
  assert.equal(MAX_CALLS.submit, 4);

  const { ctx, spent } = fakeBudget(800, 790);
  await assert.rejects(enforceDailyBudget(ctx, MAX_CALLS.start), (e: unknown) => {
    assert.ok(e instanceof ApiFailure);
    return true;
  });
  assert.equal(spent(), 790, "10 left is not enough for a start that could spend 16");
  // The same headroom is plenty for a submit, which can spend at most 4.
  await enforceDailyBudget(ctx, MAX_CALLS.submit);
  assert.equal(spent(), 794);
});

test("the budget stops at the ceiling, not one past it", async () => {
  const { ctx, spent } = fakeBudget(800, 799);
  await assert.rejects(enforceDailyBudget(ctx, MAX_CALLS.submit), (e: unknown) => {
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
  await enforceDailyBudget(ctx, MAX_CALLS.start);
  assert.equal(claims.length, 0, "disabled means it does not even ask");
});

test("the claim is made up front, so it holds when requests arrive together", async () => {
  // The regression this replaces: the budget used to COUNT ai_usage rows, which
  // are only written after the response. Fired concurrently, every request read
  // the same stale total and every one of them passed. Here 50 requests race
  // for 10 submits at 4 claimed each.
  const { ctx, spent } = fakeBudget(40);
  const outcomes = await Promise.allSettled(
    Array.from({ length: 50 }, () => enforceDailyBudget(ctx, MAX_CALLS.submit)),
  );

  const granted = outcomes.filter((o) => o.status === "fulfilled").length;
  assert.equal(granted, 10, "the ceiling binds no matter how the requests arrive");
  assert.equal(spent(), 40);
  assert.equal(ctx.reserved, 40, "every granted claim is accounted for");
  for (const outcome of outcomes) {
    if (outcome.status === "rejected") {
      assert.equal((outcome.reason as ApiFailure).code, "daily_limit_reached");
    }
  }
});
