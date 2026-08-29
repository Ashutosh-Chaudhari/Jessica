import type { MiddlewareHandler } from "hono";
import { createRepository, type UsageRow } from "@jessica/database";
import {
  createGeminiEmbeddings,
  createGeminiEvaluator,
  createGeminiTopicGenerator,
  createGroqEvaluator,
  createGroqSpeechToText,
  createGroqTopicGenerator,
  type GeminiConfig,
  type GroqChatConfig,
} from "@jessica/ai";
import type { App, RequestContext } from "../types.ts";
import { fail } from "../utils/respond.ts";
import { announceIfNew } from "../services/notify.ts";

/** Calibrated against real gemini-embedding-001 output; see wrangler.toml. */
const DEFAULT_SIMILARITY_THRESHOLD = 0.91;

/**
 * Groq's free tier allows 1000 requests/day and is the tightest limit in the
 * stack. Stopping at 800 leaves headroom so the app degrades on its own terms
 * rather than discovering the ceiling as a provider 429.
 */
const DEFAULT_DAILY_BUDGET = 800;

const REQUIRED_ENV = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "GEMINI_API_KEY",
  "GROQ_API_KEY",
] as const;

/**
 * Builds the per-request dependency set. Provider usage is buffered here and
 * written once at the end of the request so quota bookkeeping never adds
 * latency to the user-visible path (spec section 56).
 */
export const withContext: MiddlewareHandler<App> = async (c, next) => {
  const env = c.env;

  const missing = REQUIRED_ENV.filter((key) => !env[key]);
  if (missing.length > 0) {
    return fail(c, "internal", `missing configuration: ${missing.join(", ")}`);
  }

  const repo = createRepository(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const usage: UsageRow[] = [];
  const gemini: GeminiConfig = {
    apiKey: env.GEMINI_API_KEY,
    model: env.GEMINI_MODEL || "gemini-3.6-flash",
    embeddingModel: env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-001",
    thinkingLevel: env.GEMINI_THINKING_LEVEL ?? "low",
    onUsage: (e) => usage.push(e),
  };

  // Topic generation and scoring go to Groq by default. Measured, not assumed:
  //   Groq  qwen3.8-27b   1000 requests/day, ~600ms, relevance 100 on topic / 0 off
  //   Gemini 3.6-flash      20 requests/day, ~5-10s, relevance  98 on topic / 0 off
  // Same discrimination, fifty times the daily budget. Embeddings stay on
  // Gemini because Groq publishes no embedding model, and dropping semantic
  // duplicate detection would gut the product (spec sections 22, 25, 87).
  const useGemini = (env.AI_TEXT_PROVIDER || "groq").toLowerCase() === "gemini";
  const groqChat: GroqChatConfig = {
    apiKey: env.GROQ_API_KEY,
    model: env.GROQ_CHAT_MODEL || "qwen/qwen3.8-27b",
    onUsage: (e) => usage.push(e),
  };

  const ctx: RequestContext = {
    repo,
    topics: useGemini ? createGeminiTopicGenerator(gemini) : createGroqTopicGenerator(groqChat),
    embeddings: createGeminiEmbeddings(gemini),
    evaluator: useGemini
      ? createGeminiEvaluator({ ...gemini, model: env.GEMINI_EVAL_MODEL || "gemini-flash-lite-latest" })
      : createGroqEvaluator(groqChat),
    stt: createGroqSpeechToText({
      apiKey: env.GROQ_API_KEY,
      model: env.GROQ_STT_MODEL || "whisper-large-v3-turbo",
      onUsage: (e) => usage.push(e),
    }),
    similarityThreshold: Number(env.SIMILARITY_THRESHOLD) || DEFAULT_SIMILARITY_THRESHOLD,
    dailyBudget:
      env.DAILY_AI_BUDGET === undefined ? DEFAULT_DAILY_BUDGET : Number(env.DAILY_AI_BUDGET),
    flushUsage: async (userId) => {
      const pending = usage.splice(0);
      await repo.logUsage(userId, pending);
    },
  };

  c.set("ctx", ctx);
  await next();

  const user = c.get("user");

  // First sign of life from a new account. Runs after the response is settled
  // and never blocks it - one conditional UPDATE decides whether anything is
  // sent at all, so this costs a no-op write per request thereafter.
  if (user) {
    const announce = announceIfNew(repo, user.id, env.NOTIFY_WEBHOOK_URL, ctx.dailyBudget);
    try {
      c.executionCtx.waitUntil(announce);
    } catch {
      await announce;
    }
  }

  if (user && usage.length > 0) {
    const flush = ctx.flushUsage(user.id).catch((e: unknown) => console.error("usage flush:", e));
    try {
      c.executionCtx.waitUntil(flush);
    } catch {
      await flush; // no execution context (e.g. direct fetch in a test)
    }
  }
};
