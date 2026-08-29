import {
  CATEGORY_WEIGHTS,
  FALLBACK_TOPICS,
  MAX_RECORDING_SECONDS,
  isValidTopicText,
  normalizeTopic,
  pickCategory,
  type ActiveChallenge,
  type Challenge,
  type ChallengeCategory,
  type SourceType,
} from "@jessica/types";
import { withRetry } from "@jessica/ai";
import type { RequestContext } from "../types.ts";
import { NEWS_QUERIES, fetchHeadlines } from "./news.ts";

/** Spec section 26. */
const MAX_TOPIC_GENERATION_ATTEMPTS = 5;

/** Spec section 67: trend topics go stale, evergreen ones do not. */
const TREND_LIFETIME_DAYS = 30;

/** How long a retrieved headline counts as "current" (spec section 51). */
const SOURCE_TTL_HOURS = 6;

/** Headlines handed to the generator as background. */
const CONTEXT_HEADLINES = 12;

/** Below this, the cache is too thin to be worth using instead of refetching. */
const MIN_CACHED_HEADLINES = 5;

function isCategory(value: string): value is ChallengeCategory {
  return value in CATEGORY_WEIGHTS;
}

function expiryFor(category: ChallengeCategory): string | null {
  if (category !== "current_trends") return null;
  return new Date(Date.now() + TREND_LIFETIME_DAYS * 86_400_000).toISOString();
}

/**
 * The three-level current-topic strategy (spec section 20):
 *   1. no web at all - every category except current_trends
 *   2. cached headlines
 *   3. a fresh fetch, cached for the next caller
 *
 * Never throws. If retrieval fails the topic is simply generated without
 * current context (spec section 27), which is a slightly less timely challenge
 * rather than a failed request.
 */
async function currentContext(
  ctx: RequestContext,
): Promise<{ headlines: string[]; sourceType: SourceType }> {
  let cached: { source_title: string }[] = [];
  try {
    cached = await ctx.repo.getFreshSources(CONTEXT_HEADLINES);
  } catch (error) {
    console.error("topic_sources unreadable:", error);
  }

  // Level 2.
  if (cached.length >= MIN_CACHED_HEADLINES) {
    return { headlines: cached.map((c) => c.source_title), sourceType: "cached_news" };
  }

  // Level 3.
  const query = NEWS_QUERIES[Math.floor(Math.random() * NEWS_QUERIES.length)]!;
  const items = await fetchHeadlines(query);

  if (items.length === 0) {
    return cached.length > 0
      ? { headlines: cached.map((c) => c.source_title), sourceType: "cached_news" }
      : { headlines: [], sourceType: "generated" };
  }

  const expiresAt = new Date(Date.now() + SOURCE_TTL_HOURS * 3_600_000).toISOString();
  await ctx.repo.saveSources(
    items.map((item) => ({
      source_url: item.url,
      source_title: item.title,
      source_text: "",
      source_type: "news",
      published_at: item.publishedAt,
      expires_at: expiresAt,
    })),
  );
  // Only reached once per TTL window, so this is the cheap place to tidy up.
  await ctx.repo.purgeExpiredSources();

  return {
    headlines: items.slice(0, CONTEXT_HEADLINES).map((i) => i.title),
    sourceType: "fresh_web",
  };
}

function activeFrom(
  challenge: Challenge,
  assignment: { id: string; assigned_at: string },
): ActiveChallenge {
  return {
    ...challenge,
    user_challenge_id: assignment.id,
    status: "assigned",
    assigned_at: assignment.assigned_at,
    max_duration_seconds: MAX_RECORDING_SECONDS,
  };
}

/**
 * null  -> this user has already seen this topic; the caller tries another.
 * throws LostRace -> a concurrent request assigned something first.
 */
class LostRace extends Error {}

async function activate(
  ctx: RequestContext,
  userId: string,
  challenge: Challenge,
): Promise<ActiveChallenge | null> {
  const assignment = await ctx.repo.assignChallenge(userId, challenge.id);
  if (assignment.ok) return activeFrom(challenge, assignment);
  if (assignment.reason === "has_active") throw new LostRace();
  return null;
}

/** The repository does not know the product's recording limit; this does. */
export function withLimits(challenge: ActiveChallenge): ActiveChallenge {
  return { ...challenge, max_duration_seconds: MAX_RECORDING_SECONDS };
}

/**
 * The dynamic topic engine (spec section 16), cheapest path first:
 *   1. reuse an unseen topic from the shared pool - costs no AI quota
 *   2. generate, validate, embed, reject semantic duplicates, retry
 *   3. fall back to the static pool so Jessica still works when Gemini is down
 */
export async function assignNewChallenge(
  ctx: RequestContext,
  userId: string,
): Promise<ActiveChallenge> {
  try {
    return await generateAndAssign(ctx, userId);
  } catch (error) {
    if (!(error instanceof LostRace)) throw error;
    // Two overlapping /start calls - React StrictMode does this on every dev
    // page load. The other one won; return what it assigned.
    const winner = await ctx.repo.getActiveChallenge(userId);
    if (!winner) throw error;
    return withLimits(winner);
  }
}

async function generateAndAssign(
  ctx: RequestContext,
  userId: string,
): Promise<ActiveChallenge> {
  const category = pickCategory(Math.random());

  // 1. Free path (spec sections 64-65).
  for (const filter of [category, null]) {
    const pooled = await ctx.repo.pickUnseenChallenge(userId, filter, ctx.similarityThreshold);
    if (!pooled) continue;
    const active = await activate(ctx, userId, pooled);
    if (active) return active;
  }

  // 2. Generate (spec sections 22-26).
  const avoidTopics = await ctx.repo.recentPassedTopics(userId, 20);

  // Only current-trend topics pay for retrieval (spec section 20, level 1).
  const current =
    category === "current_trends"
      ? await currentContext(ctx)
      : { headlines: [] as string[], sourceType: "generated" as SourceType };

  for (let attempt = 0; attempt < MAX_TOPIC_GENERATION_ATTEMPTS; attempt++) {
    let topicText: string;
    let topicCategory: ChallengeCategory;
    try {
      const generated = await withRetry(() =>
        ctx.topics.generate({
          category,
          avoidTopics,
          context: current.headlines.length > 0 ? current.headlines : undefined,
        }),
      );
      topicText = generated.topicText;
      topicCategory = isCategory(generated.category) ? generated.category : category;
    } catch (error) {
      console.error("topic generation unavailable, falling back:", error);
      break; // spec section 27: do not keep hammering a provider that is down
    }

    if (!isValidTopicText(topicText)) continue;
    const topicKey = normalizeTopic(topicText);

    // An embedding failure degrades duplicate detection to the exact-text check
    // rather than blocking the user (spec section 27).
    let embedding: number[] | null = null;
    try {
      embedding = await ctx.embeddings.embed(topicText);
    } catch (error) {
      console.error("embedding unavailable:", error);
    }

    if (await ctx.repo.isDuplicateForUser(userId, topicKey, embedding, ctx.similarityThreshold)) {
      continue;
    }

    const challenge = await ctx.repo.upsertChallenge({
      topic_text: topicText,
      topic_key: topicKey,
      category: topicCategory,
      difficulty: 2,
      source_type: topicCategory === "current_trends" ? current.sourceType : "generated",
      embedding,
      expires_at: expiryFor(topicCategory),
    });

    const active = await activate(ctx, userId, challenge);
    if (active) return active;
  }

  // 3. Last resort (spec section 27).
  return assignFallbackChallenge(ctx, userId);
}

async function assignFallbackChallenge(
  ctx: RequestContext,
  userId: string,
): Promise<ActiveChallenge> {
  // ponytail: linear walk over ~20 seeds, one round trip each. Only reached
  // when Gemini is down AND the pool is exhausted for this user; if that stops
  // being rare, do it as a single "unseen fallback" query instead.
  const shuffled = [...FALLBACK_TOPICS].sort(() => Math.random() - 0.5);

  for (const seed of shuffled) {
    const challenge = await ctx.repo.upsertChallenge({
      topic_text: seed.text,
      topic_key: normalizeTopic(seed.text),
      category: seed.category,
      difficulty: 2,
      source_type: "generated",
      embedding: null,
      expires_at: null,
    });

    const active = await activate(ctx, userId, challenge);
    if (!active) continue;

    // Embed the one we actually handed out. This path exists because topic
    // GENERATION failed, but embeddings are a different model with its own
    // quota and are usually still up - and a challenge stored without an
    // embedding can never be matched against semantically, so passing it would
    // silently punch a permanent hole in duplicate detection (spec 22, 25).
    // Done after assignment so a user who has seen most of the seeds does not
    // pay for an embedding per skipped one.
    try {
      await ctx.repo.setChallengeEmbedding(challenge.id, await ctx.embeddings.embed(seed.text));
    } catch (error) {
      console.error("could not embed fallback topic:", error);
    }
    return active;
  }

  throw new Error("no assignable challenge remains for user");
}
