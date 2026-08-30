import type { Repository } from "@jessica/database";
import { ApiFailure } from "./failure.ts";

/** Spec section 55. Tune after real usage; these protect the free AI quotas. */
export const HOURLY_LIMITS = {
  start: 10,
  submit: 10,
} as const;

const HOUR_MS = 60 * 60 * 1000;

/**
 * The most provider calls each guarded route can make. A request claims this
 * up front and hands back whatever it did not spend.
 *
 *   start   5 generation attempts, each up to 2 calls through withRetry and
 *           each followed by an embedding, plus one more embedding if it ends
 *           up falling back to the static pool: 5 * (2 + 1) + 1.
 *   submit  transcribe then evaluate, each up to 2 calls through withRetry.
 *
 * The worst case rather than the typical one, because claiming low is the only
 * way the ceiling can be breached: admission is decided by the claim, and the
 * overrun is not known until the money is already spent. Over-claiming costs
 * nothing but strictness right at the boundary - settle_ai_calls returns the
 * difference, so the usual start, which is served from the pool for nothing,
 * gets all 16 back.
 */
export const MAX_CALLS = {
  start: 16,
  submit: 4,
} as const;

/** The part of the request context the budget needs; `reserved` is mutated. */
export interface BudgetContext {
  repo: Pick<Repository, "reserveAiCalls">;
  dailyBudget: number;
  reserved: number;
}

/**
 * A global ceiling on provider calls per UTC day, across every user.
 *
 * The per-user hourly limits stop one person hammering the app; they do
 * nothing about a hundred people each behaving reasonably. Without this, the
 * first symptom of popularity is Groq returning 429 and every submission
 * failing - an outage that looks like a broken app and needs a human to
 * notice. With it, the app stops spending on its own terms and says so.
 *
 * The budget is CLAIMED, not counted. Counting rows in ai_usage could not hold:
 * those rows are written after the response, so requests fired concurrently all
 * read the same stale total, all passed the check, and all spent quota - the
 * ceiling only ever bound sequential traffic. reserve_ai_calls increments one
 * row inside its own lock, so concurrent callers queue and each of them sees
 * the committed total.
 *
 * Deliberately counts ALL providers together rather than tracking a budget per
 * provider. One number is one thing to reason about and one thing to tune, and
 * being conservative is the point.
 */
export async function enforceDailyBudget(ctx: BudgetContext, calls: number): Promise<void> {
  if (ctx.dailyBudget <= 0) return; // 0 or negative disables the cap

  if (!(await ctx.repo.reserveAiCalls(calls, ctx.dailyBudget))) {
    throw new ApiFailure("daily_limit_reached", `budget of ${ctx.dailyBudget} provider calls is spent`);
  }
  ctx.reserved += calls;
}

/**
 * ponytail: the existing rows are the counter. No KV namespace, no Durable
 * Object, no rate_limits table - one indexed count per guarded request. Move to
 * KV only if the count query itself becomes the bottleneck.
 *
 * ponytail: this one is a soft throttle, not a guarantee - the rows it counts
 * are written at the end of the request, so a burst of concurrent calls all
 * read the same total and all pass. Left as is deliberately: the resource worth
 * protecting is the shared provider quota, and enforceDailyBudget holds that
 * atomically no matter how the requests arrive. Give it the same reservation
 * treatment only if per-user fairness within the hour starts to matter.
 */
export async function enforceHourlyLimit(
  repo: Repository,
  table: "user_challenges" | "attempts",
  userId: string,
  limit: number,
): Promise<void> {
  const since = new Date(Date.now() - HOUR_MS).toISOString();
  if ((await repo.countSince(table, userId, since)) >= limit) {
    throw new ApiFailure("rate_limited", `${table} limit ${limit}/h`);
  }
}
