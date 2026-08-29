import type { Repository } from "@jessica/database";
import type { EmbeddingProvider, EvaluationProvider, SpeechToTextProvider, TopicGenerator } from "@jessica/ai";

export interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> };

  // [vars] in wrangler.toml
  SUPABASE_URL: string;
  GEMINI_MODEL?: string;
  /**
   * Evaluation runs on its own model. The free tier meters
   * GenerateRequestsPerDayPerProjectPerModel, so splitting the two tasks across
   * two models doubles the daily budget.
   */
  GEMINI_EVAL_MODEL?: string;
  GEMINI_EMBEDDING_MODEL?: string;
  /** "low" | "high"; empty omits the field for models that reject it. */
  GEMINI_THINKING_LEVEL?: string;
  GROQ_STT_MODEL?: string;
  /** Chat model for topic generation and scoring. */
  GROQ_CHAT_MODEL?: string;
  /**
   * Which provider writes topics and scores answers: "groq" (default) or
   * "gemini". Embeddings are Gemini either way - Groq has no embedding model,
   * and semantic duplicate detection is not optional (spec sections 22, 25).
   */
  AI_TEXT_PROVIDER?: string;
  /** Dev origin allowed through CORS; unused in production (same origin). */
  ALLOWED_ORIGIN?: string;
  /** Cosine similarity above which a topic counts as already done. */
  SIMILARITY_THRESHOLD?: string;
  /**
   * Total provider calls allowed per UTC day across all users. Set to "0" to
   * remove the ceiling.
   */
  DAILY_AI_BUDGET?: string;

  // Secrets - `wrangler secret put` (spec section 52)
  /**
   * Owner notifications, all optional. Configure one; leave the rest unset and
   * no notification code runs at all.
   *   RESEND_API_KEY + NOTIFY_EMAIL_TO -> email (no domain required)
   *   NOTIFY_WEBHOOK_URL               -> ntfy.sh push, or Discord/Slack
   */
  RESEND_API_KEY?: string;
  NOTIFY_EMAIL_TO?: string;
  NOTIFY_WEBHOOK_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  GEMINI_API_KEY: string;
  GROQ_API_KEY: string;
}

export interface AuthedUser {
  id: string;
  email: string;
}

/** Everything a request handler needs, assembled once per request. */
export interface RequestContext {
  repo: Repository;
  topics: TopicGenerator;
  embeddings: EmbeddingProvider;
  evaluator: EvaluationProvider;
  stt: SpeechToTextProvider;
  similarityThreshold: number;
  /** Provider calls allowed per UTC day across every user; 0 disables it. */
  dailyBudget: number;
  /** Drained into ai_usage after the response is produced. */
  flushUsage: (userId: string) => Promise<void>;
}

export interface Variables {
  user: AuthedUser;
  ctx: RequestContext;
}

export type App = { Bindings: Env; Variables: Variables };
