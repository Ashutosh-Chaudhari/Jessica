import type { Repository } from "@jessica/database";
import { ApiFailure } from "./failure.ts";

/** Spec section 55. Tune after real usage; these protect the free AI quotas. */
export const HOURLY_LIMITS = {
  start: 10,
  submit: 10,
} as const;

const HOUR_MS = 60 * 60 * 1000;

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
