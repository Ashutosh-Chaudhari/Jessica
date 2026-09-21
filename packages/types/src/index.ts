export type ChallengeCategory =
  | "evergreen"
  | "science_technology"
  | "history"
  | "business_economics"
  | "culture_geography"
  | "current_trends"
  | "future_scenarios";

export type SourceType = "generated" | "cached_news" | "fresh_web";

/**
 * Challenge lifecycle (spec section 28):
 * NEW -> ASSIGNED -> PREPARING -> RECORDING -> PROCESSING -> PASSED/FAILED -> COMPLETED/RETRY
 */
export type UserChallengeStatus =
  | "assigned"
  | "processing"
  | "passed"
  | "failed"
  | "skipped";

export interface Profile {
  id: string;
  display_name: string;
  created_at: string;
}

export interface Challenge {
  id: string;
  topic_text: string;
  category: ChallengeCategory;
  difficulty: 1 | 2 | 3;
  source_type: SourceType;
}

export interface ActiveChallenge extends Challenge {
  user_challenge_id: string;
  assigned_at: string;
  status: UserChallengeStatus;
  /** Longest recording the backend will accept (spec section 32). The speaker
   *  picks their own limit up to this. */
  max_duration_seconds: number;
}

export interface Evaluation {
  overall: number;
  fluency: number;
  coherence: number;
  vocabulary: number;
  relevance: number;
  structure: number;
  filler_count: number;
  feedback: string[];
  passed: boolean;
  /** Why the deterministic rules rejected it; null when passed. */
  fail_reason?: string | null;
}

export type AttemptStatus = "failed" | "passed" | "processing_error";

export interface Attempt {
  id: string;
  challenge_id: string;
  topic_text: string;
  duration_seconds: number;
  transcript: string;
  overall_score: number | null;
  fluency_score: number | null;
  coherence_score: number | null;
  vocabulary_score: number | null;
  relevance_score: number | null;
  structure_score: number | null;
  filler_count: number | null;
  feedback: string[];
  status: AttemptStatus;
  created_at: string;
}

export type TrendDimension =
  | "fluency"
  | "coherence"
  | "vocabulary"
  | "relevance"
  | "structure";

/** Points gained or lost recently per dimension; null = not enough history. */
export type Trends = Record<TrendDimension, number | null>;

/**
 * All-time figures. Counted over a user's whole history, which is why they are
 * separate from the recent window the trends are computed from.
 */
export interface ProgressTotals {
  total_attempts: number;
  topics_attempted: number;
  topics_passed: number;
  /** Topics that took more than one attempt. Not the complement of passed. */
  topics_retried: number;
  speaking_seconds: number;
  average_score: number;
  best_score: number;
  current_streak_days: number;
  longest_streak_days: number;
}

export interface ProgressStats {
  completed_topics: number;
  average_score: number;
  speaking_time_seconds: number;
  current_streak_days: number;
  best_score: number;
  /** Spec sections 42, 79-80. */
  total_attempts: number;
  longest_streak_days: number;
  /** Percentages, 0-100. */
  completion_rate: number;
  retry_rate: number;
  trends: Trends;
}

export interface HistoryEntry extends Attempt {}

/* ----------------------------- API contracts ----------------------------- */

export interface AuthUser {
  id: string;
  email: string;
  display_name: string;
}

export interface StartChallengeResponse {
  challenge: ActiveChallenge;
}

export interface SubmitChallengeResponse {
  attempt: Attempt;
  evaluation: Evaluation;
}

export interface SignupResult {
  user: AuthUser | null;
  /** Supabase is configured to require email confirmation before first login. */
  needs_email_confirmation: boolean;
}

/**
 * Controlled error codes returned by the Worker (spec sections 60, 77, 78).
 * Provider errors are never forwarded to the user verbatim.
 */
export type ApiErrorCode =
  | "unauthorized"
  | "not_found"
  | "rate_limited"
  | "daily_limit_reached"
  | "invalid_request"
  | "audio_too_large"
  | "recording_too_long"
  | "provider_unavailable"
  | "internal";

export interface ApiError {
  error: ApiErrorCode;
  message: string;
}

export const API_ERROR_MESSAGES: Record<ApiErrorCode, string> = {
  unauthorized: "Please log in again.",
  not_found: "That is no longer available.",
  rate_limited: "You have done a lot of challenges recently. Try again in a little while.",
  daily_limit_reached:
    "Jessica has used up today's speaking budget. It resets at midnight UTC - come back then.",
  invalid_request: "That request was not valid.",
  audio_too_large: "That recording is too large to upload.",
  recording_too_long: "That recording is longer than the two-minute limit.",
  provider_unavailable: "Jessica is temporarily busy. Please try again later.",
  internal: "Something went wrong on our side. Please try again.",
};

/** Upload guard (spec sections 32, 53). Groq accepts up to 25 MB. */
export const MAX_AUDIO_BYTES = 12 * 1024 * 1024;

export * from "./logic.ts";
export * from "./topics.ts";
