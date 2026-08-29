import type { Repository } from "@jessica/database";
import { ApiFailure } from "./failure.ts";

/** Spec section 55. Tune after real usage; these protect the free AI quotas. */
export const HOURLY_LIMITS = {
  start: 10,
  submit: 10,
} as const;

const HOUR_MS = 60 * 60 * 1000;

/**
 * A global ceiling on provider calls per UTC day, across every user.
 *
 * The per-user hourly limits stop one person hammering the app; they do
 * nothing about a hundred people each behaving reasonably. Without this, the
 * first symptom of popularity is Groq returning 429 and every submission
 * failing - an outage that looks like a broken app and needs a human to
 * notice. With it, the app stops spending on its own terms and says so.
 *
 * Deliberately counts ALL providers together rather than tracking a budget per
 * provider. One number is one thing to reason about and one thing to tune, and
 * being conservative is the point.
 */
export async function enforceDailyBudget(repo: Repository, budget: number): Promise<void> {
  if (budget <= 0) return; // 0 or negative disables the cap

  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  const spent = await repo.countUsageSince(startOfDay.toISOString());
  if (spent >= budget) {
    throw new ApiFailure("daily_limit_reached", `${spent}/${budget} provider calls used today`);
  }
}

/**
 * ponytail: the existing rows are the counter. No KV namespace, no Durable
 * Object, no rate_limits table - one indexed count per guarded request. Move to
 * KV only if the count query itself becomes the bottleneck.
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
