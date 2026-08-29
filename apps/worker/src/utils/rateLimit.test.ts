// Run: npm test   (node --test, no framework)
import { test } from "node:test";
import assert from "node:assert/strict";
import { enforceDailyBudget } from "./rateLimit.ts";
import { ApiFailure } from "./failure.ts";

/** Just enough of the repository for the budget guard. */
function fakeRepo(spent: number) {
  const calls: string[] = [];
  return {
    calls,
    repo: {
      countUsageSince: async (since: string) => {
        calls.push(since);
        return spent;
      },
    } as never,
  };
}

test("the budget allows calls while there is headroom", async () => {
  const { repo } = fakeRepo(799);
  await enforceDailyBudget(repo, 800); // must not throw
});

test("the budget stops at the ceiling, not one past it", async () => {
  const { repo } = fakeRepo(800);
  await assert.rejects(enforceDailyBudget(repo, 800), (e: unknown) => {
    assert.ok(e instanceof ApiFailure);
    // The user must get the polite stop, never a provider error.
    assert.equal(e.code, "daily_limit_reached");
    return true;
  });
});

test("a budget of 0 disables the cap entirely", async () => {
  const { repo, calls } = fakeRepo(999999);
  await enforceDailyBudget(repo, 0);
  assert.equal(calls.length, 0, "disabled means it does not even query");
});

test("the window is the current UTC day, not a rolling 24 hours", async () => {
  const { repo, calls } = fakeRepo(0);
  await enforceDailyBudget(repo, 800);

  const since = new Date(calls[0]!);
  assert.equal(since.getUTCHours(), 0);
  assert.equal(since.getUTCMinutes(), 0);
  assert.equal(since.getUTCSeconds(), 0);
  assert.equal(since.getUTCMilliseconds(), 0);
  // Today, so the count resets at midnight rather than trailing yesterday.
  assert.equal(since.toISOString().slice(0, 10), new Date().toISOString().slice(0, 10));
});
