/**
 * AI provider interfaces (spec section 58). One interface per capability so
 * that a provider can be swapped without touching the rest of Jessica.
 */
export interface TopicGenerator {
  generate(input: TopicGeneratorInput): Promise<TopicGeneratorResult>;
}

export interface SpeechToTextProvider {
  transcribe(audio: ArrayBuffer, mimeType: string): Promise<TranscriptResult>;
}

export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
}

export interface EvaluationProvider {
  evaluate(topicText: string, transcript: string): Promise<EvaluationResult>;
}

export interface TopicGeneratorInput {
  /** Category the distribution roll asked for (spec section 21). */
  category: string;
  /** Recently used topic texts the model should steer away from. */
  avoidTopics?: string[];
  /**
   * Current headlines for background (spec sections 18-20). Present only for
   * current-trend topics; everything else is generated without a web round trip.
   */
  context?: string[];
}

export interface TopicGeneratorResult {
  topicText: string;
  category: string;
}

export interface TranscriptResult {
  text: string;
  /**
   * Duration measured by the STT provider from the audio itself. The client's
   * self-reported duration is never trusted for pass/fail (spec section 53).
   */
  durationSeconds: number;
}

export interface EvaluationResult {
  overall: number;
  fluency: number;
  coherence: number;
  vocabulary: number;
  relevance: number;
  structure: number;
  filler_count: number;
  feedback: string[];
}

/** Reported per provider call so the Worker can log quota use (spec section 56). */
export interface UsageEvent {
  provider: string;
  model: string;
  request_type: string;
  units: number;
  ok: boolean;
}

export type UsageSink = (event: UsageEvent) => void;

/**
 * A provider failed. This is a system failure, never a user failure
 * (spec section 78) - the caller turns it into a controlled error and does not
 * mark the challenge failed.
 */
export class ProviderError extends Error {
  readonly provider: string;
  readonly status: number;
  /** How long the provider asked us to wait, when it said so. */
  readonly retryAfterMs?: number;

  // Plain fields, not parameter properties: those are not erasable TypeScript,
  // so `node --test` cannot type-strip a file that uses them.
  constructor(provider: string, status: number, message: string, retryAfterMs?: number) {
    super(`${provider}: ${message}`);
    this.name = "ProviderError";
    this.provider = provider;
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }

  /** Rate limits and server errors are worth one more shot; 4xx are not. */
  get retryable(): boolean {
    if (this.retryAfterMs !== undefined && this.retryAfterMs > MAX_RETRY_WAIT_MS) {
      // The provider told us to come back in a minute. A user is waiting;
      // fall back to a cheaper path instead of holding the request open.
      return false;
    }
    return this.status === 0 || this.status === 429 || this.status >= 500;
  }
}

/**
 * Longest we will sit on a provider's retry hint before giving up on it.
 * Gemini's free tier answers a mild overage with ~1.7s and a burst with 40s;
 * the first is worth waiting for, the second is not.
 */
export const MAX_RETRY_WAIT_MS = 5_000;

/**
 * Spec section 77: retry once, then give up.
 *
 * Prefers the provider's own retry hint over a guessed backoff. Gemini returns
 * RetryInfo.retryDelay on a 429, and a fixed 400ms backoff ignored it - which
 * turned a wait-and-succeed into an unnecessary fall back to a static topic.
 */
export async function withRetry<T>(fn: () => Promise<T>, attempts = 2): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (error instanceof ProviderError && !error.retryable) throw error;
      if (i >= attempts - 1) break;

      const hinted = error instanceof ProviderError ? error.retryAfterMs : undefined;
      const wait = Math.min(hinted ?? 400 * (i + 1), MAX_RETRY_WAIT_MS);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastError;
}
