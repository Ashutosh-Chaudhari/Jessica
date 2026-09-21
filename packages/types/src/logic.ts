import type {
  AttemptStatus,
  ChallengeCategory,
  Evaluation,
  ProgressStats,
  ProgressTotals,
  TrendDimension,
  Trends,
} from "./index.ts";

// Everything imported above is type-only, so it disappears at compile time.
// That matters: index.ts re-exports this module, and a *value* import back into
// it would be a runtime cycle - which is exactly how DEFAULT_PASS_RULES once
// evaluated to undefined inside a bundle.

/* ------------------------------- pass rules -------------------------------- */

/** Deterministic pass/fail inputs (spec sections 38-39). The backend applies these. */
export interface PassRules {
  min_duration_seconds: number;
  min_relevance: number;
  min_transcript_words: number;
}

export const DEFAULT_PASS_RULES: PassRules = {
  min_duration_seconds: 45,
  min_relevance: 50,
  min_transcript_words: 40,
};

export interface DurationOption {
  seconds: number;
  label: string;
  rules: PassRules;
}

/**
 * How long the speaker may talk for, and the bar each length is judged at.
 * The rules move with the choice - a 30-second answer cannot be held to a
 * 45-second minimum, and the word count has to fit in the time too.
 */
export const DURATION_OPTIONS: DurationOption[] = [
  {
    seconds: 30,
    label: "30 sec",
    rules: { ...DEFAULT_PASS_RULES, min_duration_seconds: 20, min_transcript_words: 25 },
  },
  {
    seconds: 60,
    label: "1 min",
    rules: { ...DEFAULT_PASS_RULES, min_duration_seconds: 35, min_transcript_words: 40 },
  },
  { seconds: 120, label: "2 min", rules: DEFAULT_PASS_RULES },
];

/** The hard ceiling the Worker enforces: the longest length anyone can pick. */
export const MAX_RECORDING_SECONDS = Math.max(...DURATION_OPTIONS.map((o) => o.seconds));

/**
 * Unknown lengths fall back to the strictest rules rather than the most
 * lenient, so a client that sends nothing (or garbage) cannot lower its own bar.
 */
export function passRulesFor(maxSeconds: number): PassRules {
  return DURATION_OPTIONS.find((o) => o.seconds === maxSeconds)?.rules ?? DEFAULT_PASS_RULES;
}

/* -------------------------------- topics --------------------------------- */

/**
 * Canonical form used for the exact-duplicate check (spec section 23).
 * Case, punctuation and whitespace differences must not create a "new" topic.
 */
export function normalizeTopic(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Quality gate before a generated topic is accepted (spec section 16). */
export function isValidTopicText(text: string): boolean {
  const t = text.trim();
  const words = countWords(t);
  return (
    t.length >= 20 &&
    t.length <= 220 &&
    words >= 5 &&
    words <= 40 &&
    !/^(sure|okay|here)\b/i.test(t) &&
    !t.includes("\n")
  );
}

/** Spec section 21. Percentages are never shown to the user. */
export const CATEGORY_WEIGHTS: Record<ChallengeCategory, number> = {
  evergreen: 30,
  science_technology: 20,
  history: 15,
  business_economics: 10,
  culture_geography: 10,
  current_trends: 10,
  future_scenarios: 5,
};

/** `roll` is a number in [0, 1). */
export function pickCategory(roll: number): ChallengeCategory {
  const entries = Object.entries(CATEGORY_WEIGHTS) as [ChallengeCategory, number][];
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let cursor = Math.min(Math.max(roll, 0), 0.999999) * total;
  for (const [category, weight] of entries) {
    cursor -= weight;
    if (cursor < 0) return category;
  }
  return "evergreen";
}

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export type FailReason =
  | "too_short"
  | "not_enough_speech"
  | "off_topic"
  | null;

/**
 * Deterministic pass/fail (spec sections 38-39). The LLM supplies measurements;
 * this function - never the LLM - decides the outcome.
 */
export function applyPassRules(
  durationSeconds: number,
  transcript: string,
  relevance: number,
  rules: PassRules = DEFAULT_PASS_RULES,
): { passed: boolean; reason: FailReason } {
  if (durationSeconds < rules.min_duration_seconds) return { passed: false, reason: "too_short" };
  if (countWords(transcript) < rules.min_transcript_words) {
    return { passed: false, reason: "not_enough_speech" };
  }
  if (relevance < rules.min_relevance) return { passed: false, reason: "off_topic" };
  return { passed: true, reason: null };
}

export function failMessage(
  reason: Exclude<FailReason, null>,
  rules: PassRules = DEFAULT_PASS_RULES,
): string {
  switch (reason) {
    case "too_short":
      return `You spoke for less than ${rules.min_duration_seconds} seconds. Give the topic a fuller answer.`;
    case "not_enough_speech":
      return "There was not enough speech to evaluate properly.";
    case "off_topic":
      return "Your answer drifted away from the topic.";
  }
}

/* --------------------------- AI output validation -------------------------- */

const SCORE_KEYS = [
  "overall",
  "fluency",
  "coherence",
  "vocabulary",
  "relevance",
  "structure",
] as const;

function clampScore(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(Math.min(100, Math.max(0, n)));
}

/**
 * Validates an LLM evaluation payload (spec section 53). Returns null when the
 * model returned something unusable, so the caller can retry or fail cleanly
 * instead of writing garbage scores to the database.
 */
export function parseEvaluation(raw: unknown): Omit<Evaluation, "passed"> | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;

  const scores: Record<string, number> = {};
  for (const key of SCORE_KEYS) {
    const v = clampScore(o[key]);
    if (v === null) return null;
    scores[key] = v;
  }

  const fillerRaw = clampScore(o.filler_count);
  const feedback = Array.isArray(o.feedback)
    ? o.feedback.filter((f): f is string => typeof f === "string" && f.trim().length > 0).slice(0, 6)
    : [];
  if (feedback.length === 0) return null;

  return {
    overall: scores.overall!,
    fluency: scores.fluency!,
    coherence: scores.coherence!,
    vocabulary: scores.vocabulary!,
    relevance: scores.relevance!,
    structure: scores.structure!,
    filler_count: fillerRaw ?? 0,
    feedback,
  };
}

/* -------------------------------- progress -------------------------------- */

export interface ProgressRow {
  created_at: string;
  challenge_id: string;
  duration_seconds: number;
  overall_score: number | null;
  fluency_score?: number | null;
  coherence_score?: number | null;
  vocabulary_score?: number | null;
  relevance_score?: number | null;
  structure_score?: number | null;
  status: AttemptStatus;
}

/** How many recent attempts a trend compares against the ones before them. */
const TREND_WINDOW = 5;
/** Below this in either half, a "trend" would be noise, so report nothing. */
const MIN_FOR_TREND = 2;

const DIMENSIONS: Record<TrendDimension, (row: ProgressRow) => number | null | undefined> = {
  fluency: (r) => r.fluency_score,
  coherence: (r) => r.coherence_score,
  vocabulary: (r) => r.vocabulary_score,
  relevance: (r) => r.relevance_score,
  structure: (r) => r.structure_score,
};

function utcDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function nextUtcDay(dayKey: string): string {
  const d = new Date(`${dayKey}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return utcDay(d);
}

function mean(values: number[]): number {
  return values.reduce((sum, n) => sum + n, 0) / values.length;
}

function percent(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

/**
 * Streak = consecutive UTC days with at least one passed attempt, counting back
 * from today. Not speaking yet *today* does not break the streak; missing a
 * full day does.
 */
export function computeStreak(rows: ProgressRow[], now: Date = new Date()): number {
  const days = passedDays(rows);
  const cursor = new Date(now);
  if (!days.has(utcDay(cursor))) cursor.setUTCDate(cursor.getUTCDate() - 1);

  let streak = 0;
  while (days.has(utcDay(cursor))) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

/** The best run the user has ever had, anywhere in their history. */
export function computeLongestStreak(rows: ProgressRow[]): number {
  const days = [...passedDays(rows)].sort();
  let longest = 0;
  let run = 0;
  let previous: string | null = null;

  for (const day of days) {
    run = previous !== null && nextUtcDay(previous) === day ? run + 1 : 1;
    previous = day;
    if (run > longest) longest = run;
  }
  return longest;
}

function passedDays(rows: ProgressRow[]): Set<string> {
  return new Set(
    rows.filter((r) => r.status === "passed").map((r) => r.created_at.slice(0, 10)),
  );
}

/**
 * Spec section 42: per-dimension trend. The recent window minus the window
 * before it, in points. null means there is not enough history to say anything
 * honest yet - which is different from "no change", so the UI must not print a
 * zero for it.
 */
export function computeTrends(rows: ProgressRow[]): Trends {
  const newestFirst = [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const out = {} as Trends;

  for (const dimension of Object.keys(DIMENSIONS) as TrendDimension[]) {
    const values = newestFirst
      .map(DIMENSIONS[dimension])
      .filter((n): n is number => typeof n === "number");

    const recent = values.slice(0, TREND_WINDOW);
    const previous = values.slice(TREND_WINDOW, TREND_WINDOW * 2);
    out[dimension] =
      recent.length >= MIN_FOR_TREND && previous.length >= MIN_FOR_TREND
        ? Math.round(mean(recent) - mean(previous))
        : null;
  }
  return out;
}

/**
 * The all-time figures, from a user's complete history.
 *
 * This is the specification the SQL function user_progress_totals() mirrors.
 * The Worker uses the SQL version because counting a whole history in Postgres
 * has no row ceiling; the mock uses this one because localStorage holds
 * everything anyway. Keep the two in step.
 *
 * Rates are per TOPIC. A topic that failed twice and then passed counts once as
 * passed and once as retried - those are not complementary, which is exactly
 * why they are counted rather than derived from one another.
 */
export function computeTotals(rows: ProgressRow[], now: Date = new Date()): ProgressTotals {
  const attemptsPerTopic = new Map<string, { attempts: number; passed: boolean }>();
  for (const row of rows) {
    const entry = attemptsPerTopic.get(row.challenge_id) ?? { attempts: 0, passed: false };
    entry.attempts += 1;
    entry.passed = entry.passed || row.status === "passed";
    attemptsPerTopic.set(row.challenge_id, entry);
  }

  const topics = [...attemptsPerTopic.values()];
  const passedScores = rows
    .filter((r) => r.status === "passed")
    .map((r) => r.overall_score ?? 0);

  return {
    total_attempts: rows.length,
    topics_attempted: topics.length,
    topics_passed: topics.filter((t) => t.passed).length,
    topics_retried: topics.filter((t) => t.attempts > 1).length,
    speaking_seconds: rows.reduce((s, r) => s + (r.duration_seconds || 0), 0),
    average_score: passedScores.length ? Math.round(mean(passedScores)) : 0,
    best_score: passedScores.length ? Math.max(...passedScores) : 0,
    current_streak_days: computeStreak(rows, now),
    longest_streak_days: computeLongestStreak(rows),
  };
}

/**
 * `recent` only needs to be the last handful of attempts - it feeds the trends.
 * Everything all-time comes from `totals`, which is counted over the whole
 * history rather than over whatever page of rows happened to be fetched.
 */
export function computeProgress(
  recent: ProgressRow[],
  totals: ProgressTotals,
): ProgressStats {
  return {
    completed_topics: totals.topics_passed,
    average_score: totals.average_score,
    speaking_time_seconds: totals.speaking_seconds,
    current_streak_days: totals.current_streak_days,
    best_score: totals.best_score,

    total_attempts: totals.total_attempts,
    longest_streak_days: totals.longest_streak_days,
    completion_rate: percent(totals.topics_passed, totals.topics_attempted),
    retry_rate: percent(totals.topics_retried, totals.topics_attempted),
    trends: computeTrends(recent),
  };
}
