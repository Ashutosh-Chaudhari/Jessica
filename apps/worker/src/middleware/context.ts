import type { MiddlewareHandler } from "hono";
import { createRepository, type UsageRow } from "@jessica/database";
import {
  createGeminiEmbeddings,
  createGeminiEvaluator,
  createGeminiTopicGenerator,
  createGroqSpeechToText,
  type GeminiConfig,
} from "@jessica/ai";
import type { App, RequestContext } from "../types.ts";
import { fail } from "../utils/respond.ts";

/** Calibrated against real gemini-embedding-001 output; see wrangler.toml. */
const DEFAULT_SIMILARITY_THRESHOLD = 0.91;

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

  const ctx: RequestContext = {
    repo,
    topics: createGeminiTopicGenerator(gemini),
    embeddings: createGeminiEmbeddings(gemini),
    // Scoring is a smaller job than inventing a topic, and it bills against a
    // separate per-model quota. Measured on the same transcripts: relevance 95
    // vs 98, off-topic still collapses to 0, and it answers in ~1.4s not ~7s.
    evaluator: createGeminiEvaluator({
      ...gemini,
      model: env.GEMINI_EVAL_MODEL || "gemini-flash-lite-latest",
    }),
    stt: createGroqSpeechToText({
      apiKey: env.GROQ_API_KEY,
      model: env.GROQ_STT_MODEL || "whisper-large-v3-turbo",
      onUsage: (e) => usage.push(e),
    }),
    similarityThreshold: Number(env.SIMILARITY_THRESHOLD) || DEFAULT_SIMILARITY_THRESHOLD,
    flushUsage: async (userId) => {
      const pending = usage.splice(0);
      await repo.logUsage(userId, pending);
    },
  };

  c.set("ctx", ctx);
  await next();

  const user = c.get("user");
  if (user && usage.length > 0) {
    const flush = ctx.flushUsage(user.id).catch((e: unknown) => console.error("usage flush:", e));
    try {
      c.executionCtx.waitUntil(flush);
    } catch {
      await flush; // no execution context (e.g. direct fetch in a test)
    }
  }
};
