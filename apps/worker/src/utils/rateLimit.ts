import type { Repository } from "@jessica/database";
import { ApiFailure } from "./failure.ts";

/** Spec section 55. Tune after real usage; these protect the free AI quotas. */
export const HOURLY_LIMITS = {
  start: 10,
  submit: 10,
} as const;

const HOUR_MS = 60 * 60 * 1000;

/**
 * What a request claims against the budget before it knows its real cost. Two
 * is the common path for both guarded routes: transcribe + evaluate on submit,
 * generate + embed on start. The estimate only has to be close, because the
 * request settles it against the true count on the way out.
 */
export const ESTIMATED_CALLS_PER_REQUEST = 2;

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
export async function enforceDailyBudget(ctx: BudgetContext): Promise<void> {
  if (ctx.dailyBudget <= 0) return; // 0 or negative disables the cap

  if (!(await ctx.repo.reserveAiCalls(ESTIMATED_CALLS_PER_REQUEST, ctx.dailyBudget))) {
    throw new ApiFailure("daily_limit_reached", `budget of ${ctx.dailyBudget} provider calls is spent`);
  }
  ctx.reserved += ESTIMATED_CALLS_PER_REQUEST;
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
