import { Hono } from "hono";
import { MAX_AUDIO_BYTES } from "@jessica/types";
import type { App } from "../types.ts";
import { assignNewChallenge, withLimits } from "../services/topics.ts";
import { submitAttempt } from "../services/pipeline.ts";
import { fail, failFromError } from "../utils/respond.ts";
import { HOURLY_LIMITS, enforceHourlyLimit } from "../utils/rateLimit.ts";

export const challenges = new Hono<App>();

/**
 * Spec section 47. A live challenge is always returned as-is: refreshing the
 * page must never consume a topic (spec section 31), and it must not count
 * against the rate limit either.
 */
challenges.post("/start", async (c) => {
  const ctx = c.get("ctx");
  const user = c.get("user");
  try {
    const existing = await ctx.repo.getActiveChallenge(user.id);
    if (existing) return c.json({ challenge: withLimits(existing) });

    await enforceHourlyLimit(ctx.repo, "user_challenges", user.id, HOURLY_LIMITS.start);
    return c.json({ challenge: await assignNewChallenge(ctx, user.id) });
  } catch (error) {
    return failFromError(c, error);
  }
});

challenges.get("/current", async (c) => {
  const ctx = c.get("ctx");
  try {
    const existing = await ctx.repo.getActiveChallenge(c.get("user").id);
    return c.json({ challenge: existing ? withLimits(existing) : null });
  } catch (error) {
    return failFromError(c, error);
  }
});

/** Spec section 48. */
challenges.post("/:id/submit", async (c) => {
  const ctx = c.get("ctx");
  const user = c.get("user");

  const declaredSize = Number(c.req.header("content-length") ?? 0);
  if (declaredSize > MAX_AUDIO_BYTES) return fail(c, "audio_too_large", declaredSize);

  let audio: File;
  let clientDuration = 0;
  try {
    const form = await c.req.formData();
    const field = form.get("audio");
    if (!(field instanceof File) || field.size === 0) return fail(c, "invalid_request", "no audio field");
    if (field.size > MAX_AUDIO_BYTES) return fail(c, "audio_too_large", field.size);
    audio = field;
    clientDuration = Number(form.get("client_duration_seconds")) || 0;
  } catch (error) {
    return fail(c, "invalid_request", error);
  }

  try {
    await enforceHourlyLimit(ctx.repo, "attempts", user.id, HOURLY_LIMITS.submit);
    const result = await submitAttempt(
      ctx,
      user.id,
      c.req.param("id"),
      await audio.arrayBuffer(),
      audio.type || "audio/webm",
      clientDuration,
    );
    return c.json(result);
  } catch (error) {
    return failFromError(c, error);
  }
});

/** Spec section 29: a failed challenge keeps the same topic. */
challenges.post("/:id/retry", async (c) => {
  const ctx = c.get("ctx");
  try {
    const active = await ctx.repo.getActiveChallenge(c.get("user").id);
    if (!active || active.id !== c.req.param("id")) return fail(c, "not_found");
    // Reset from whatever the row says, not just from 'failed'. Retry is the
    // user's escape hatch, so it must never report "assigned" while leaving a
    // different status in the database.
    if (active.status !== "assigned") {
      await ctx.repo.setChallengeStatus(active.user_challenge_id, "assigned");
    }
    return c.json({ challenge: withLimits({ ...active, status: "assigned" }) });
  } catch (error) {
    return failFromError(c, error);
  }
});

/** Give up on this topic without passing it; the next start generates a new one. */
challenges.post("/:id/skip", async (c) => {
  const ctx = c.get("ctx");
  try {
    const active = await ctx.repo.getActiveChallenge(c.get("user").id);
    if (!active || active.id !== c.req.param("id")) return fail(c, "not_found");
    await ctx.repo.setChallengeStatus(active.user_challenge_id, "skipped");
    return c.json({ ok: true });
  } catch (error) {
    return failFromError(c, error);
  }
});
