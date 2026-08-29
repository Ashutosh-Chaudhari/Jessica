// Run: npm test   (node --test, no framework)
import { test } from "node:test";
import assert from "node:assert/strict";
import { announceIfNew, formatNewUserMessage } from "./notify.ts";

test("the message reads correctly for the very first user", () => {
  const m = formatNewUserMessage({
    displayName: "Ada",
    users: 1,
    attemptsToday: 1,
    callsToday: 4,
    dailyBudget: 800,
  });
  assert.match(m, /\*\*Ada\*\* just started using Jessica\./);
  assert.match(m, /1 person has signed up/); // singular, not "1 people have"
  assert.match(m, /1 attempt today/); // singular
  assert.match(m, /4\/800 AI calls used today \(1%\)/);
});

test("the message pluralises once there is more than one", () => {
  const m = formatNewUserMessage({
    displayName: "Grace",
    users: 12,
    attemptsToday: 30,
    callsToday: 400,
    dailyBudget: 800,
  });
  assert.match(m, /12 people have signed up/);
  assert.match(m, /30 attempts today/);
  assert.match(m, /400\/800 AI calls used today \(50%\)/);
});

test("an uncapped budget is reported honestly rather than dividing by zero", () => {
  const m = formatNewUserMessage({
    displayName: "Alan",
    users: 3,
    attemptsToday: 2,
    callsToday: 9,
    dailyBudget: 0,
  });
  assert.match(m, /9 AI calls today \(no cap set\)/);
  assert.doesNotMatch(m, /NaN|Infinity/);
});

test("no webhook configured means no work at all", async () => {
  let touched = false;
  const repo = {
    claimNewUserNotification: async () => {
      touched = true;
      return { display_name: "x" };
    },
  } as never;

  await announceIfNew(repo, "user-1", undefined, 800);
  assert.equal(touched, false, "must not even claim when there is nowhere to send");
});

test("a repository failure never propagates to the caller", async () => {
  const repo = {
    claimNewUserNotification: async () => {
      throw new Error("database is on fire");
    },
  } as never;

  // The user's request must succeed even if notification is broken.
  await announceIfNew(repo, "user-1", "https://example.invalid/hook", 800);
});

test("an already-announced user sends nothing", async () => {
  let snapshots = 0;
  const repo = {
    claimNewUserNotification: async () => null, // someone else claimed it
    siteSnapshot: async () => {
      snapshots += 1;
      return { users: 1, attemptsToday: 0, callsToday: 0 };
    },
  } as never;

  await announceIfNew(repo, "user-1", "https://example.invalid/hook", 800);
  assert.equal(snapshots, 0, "no claim means no further work");
});
