import type { AttemptStatus, HistoryEntry, TrendDimension, Trends } from "@jessica/types";

/**
 * Read-side helpers over the history the API already returns. Nothing here is
 * a new measurement: each function regroups or counts stored attempts, so
 * every number it produces can be traced back to a row.
 */

export const DIMENSIONS: {
  key: TrendDimension;
  label: string;
  score: (e: HistoryEntry) => number | null;
}[] = [
  { key: "fluency", label: "Fluency", score: (e) => e.fluency_score },
  { key: "coherence", label: "Coherence", score: (e) => e.coherence_score },
  { key: "vocabulary", label: "Vocabulary", score: (e) => e.vocabulary_score },
  { key: "relevance", label: "Relevance", score: (e) => e.relevance_score },
  { key: "structure", label: "Structure", score: (e) => e.structure_score },
];

export type Outcome = "done" | "retry" | "error";

/** What a session ended as, in the words the interface uses for it. */
export function outcomeOf(status: AttemptStatus): { label: string; tone: Outcome } {
  if (status === "passed") return { label: "Completed", tone: "done" };
  if (status === "failed") return { label: "Retry", tone: "retry" };
  return { label: "Not scored", tone: "error" };
}

/** UTC day, the same calendar the streak is counted on. */
export function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

/** Monday (UTC) of the week containing `d`, as YYYY-MM-DD. */
export function weekStart(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7));
  return t.toISOString().slice(0, 10);
}

export interface Week {
  start: string;
  entries: HistoryEntry[];
}

/** The last `count` calendar weeks, oldest first. Empty weeks stay in - a gap is information. */
export function lastWeeks(entries: HistoryEntry[], count: number, now = new Date()): Week[] {
  const current = new Date(`${weekStart(now)}T00:00:00.000Z`);
  const weeks: Week[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(current);
    d.setUTCDate(d.getUTCDate() - i * 7);
    weeks.push({ start: d.toISOString().slice(0, 10), entries: [] });
  }
  const byStart = new Map(weeks.map((w) => [w.start, w]));
  for (const e of entries) byStart.get(weekStart(new Date(e.created_at)))?.entries.push(e);
  return weeks;
}

/** Sessions per UTC day over the last `days` days, oldest first. */
export function lastDays(
  entries: HistoryEntry[],
  days: number,
  now = new Date(),
): { day: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const e of entries) counts.set(dayKey(e.created_at), (counts.get(dayKey(e.created_at)) ?? 0) + 1);

  const out: { day: string; count: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    const day = d.toISOString().slice(0, 10);
    out.push({ day, count: counts.get(day) ?? 0 });
  }
  return out;
}

function average(values: number[]): number | null {
  return values.length ? Math.round(values.reduce((s, n) => s + n, 0) / values.length) : null;
}

/** Average overall of completed sessions - the same rule the headline average uses. */
export function completedAverage(entries: HistoryEntry[]): number | null {
  return average(
    entries.filter((e) => e.status === "passed" && e.overall_score !== null).map((e) => e.overall_score!),
  );
}

export function oldestFirst(entries: HistoryEntry[]): HistoryEntry[] {
  return [...entries].sort((a, b) => a.created_at.localeCompare(b.created_at));
}

/** The last scored attempt at the same topic, made before this one. */
export function previousAttempt(
  entries: HistoryEntry[],
  attempt: { id: string; challenge_id: string; created_at: string },
): HistoryEntry | null {
  return (
    entries
      .filter(
        (e) =>
          e.challenge_id === attempt.challenge_id &&
          e.id !== attempt.id &&
          e.created_at < attempt.created_at &&
          e.overall_score !== null,
      )
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null
  );
}

/*
 * Sorting the scorer's notes is precision-first: a line is only filed under
 * "Improve next" or "What you did well" on an unmistakable signal, and
 * everything else goes to a neutral "Also noted". Getting a heading wrong -
 * criticism shown as praise - would misreport the feedback; a neutral heading
 * never can.
 */

/* An instruction: the clause opens on a verb. The look-ahead rules out the same
   word used as a noun - "Use of examples was...", "Structure was clear". */
const IMPERATIVE =
  /^(?:try|avoid|reduce|cut|limit|pause|slow|vary|consider|aim|make|keep|focus|practi[cs]e|include|give|add|replace|swap|drop|remove|choose|speak|be|don'?t|do not|stop|watch|wrap|work|link|connect|signpost|summari[sz]e|conclude|clarify|expand|develop|organi[sz]e|explain|state|start|open|end|finish|close|back|support|use|structure|split|tighten|shorten|lead)\b(?!\s+(?:of|was|is|were|are|has|had|felt|seemed|made|and|from|in|throughout|overall)\b)/i;

/* A suggestion phrased as one, anywhere in the line. */
const SUGGESTION =
  /\b(?:you could|could have|should|would (?:make|help|strengthen|improve|benefit|sharpen|tighten|be (?:stronger|clearer|better|more))|try (?:to|adding|using)|consider|next time|work on|instead of|aim (?:to|for))\b/i;

/* A positive judgement... */
const PRAISE =
  /\b(?:clear(?:ly)?|strong|good|well|effective(?:ly)?|concrete|specific|steady|logical(?:ly)?|relevant|focused|stayed (?:on|focused)|easy to follow|engaging|vivid|precise|varied|smooth(?:ly)?|natural(?:ly)?|organi[sz]ed|coherent|structured|on topic|to the point)\b/i;

/* ...with nothing qualifying it. Any hedge or negative sends the line to "Also noted". */
const QUALIFIER =
  /\b(?:not|no|never|nothing|without|but|however|although|though|lack(?:ed|ing|s)?|few|little|weak|too|less|more|missing|unclear|rushed|abrupt(?:ly)?|vague|repetitive|wander(?:ed|ing)?|drift(?:ed|ing)?|hesitat\w*|filler|um|uh|harder|hard to|could|should|would)\b|n't\b/i;

type FeedbackGroup = "improve" | "worked" | "other";

function groupOf(line: string): FeedbackGroup {
  // "Long sentences made it hard to follow; split them" carries its
  // instruction after the break, so each clause gets its own look.
  const clauses = line.split(/\s*[;:]\s+|\s+[—–-]\s+/).map((c) => c.trim());
  if (clauses.some((c) => IMPERATIVE.test(c)) || SUGGESTION.test(line)) return "improve";
  if (PRAISE.test(line) && !QUALIFIER.test(line)) return "worked";
  return "other";
}

/**
 * The scorer returns one list of notes (packages/ai/src/prompts.ts). This only
 * sorts that list for the report - every line is shown exactly as written, in
 * its original order within its group, and nothing is added or reworded.
 */
export function groupFeedback(lines: string[]): Record<FeedbackGroup, string[]> {
  const out: Record<FeedbackGroup, string[]> = { improve: [], worked: [], other: [] };
  for (const line of lines) out[groupOf(line)].push(line);
  return out;
}

/**
 * Below this, a difference between two scorings is not worth a sentence.
 * ponytail: one fixed threshold for every dimension; model scores wobble a few
 * points between near-identical answers. Tune per dimension if real gains get
 * reported as "about the same".
 */
export const NOTABLE_CHANGE = 4;

export function describeChange(label: string, previous: number, current: number): string {
  const diff = current - previous;
  if (Math.abs(diff) < NOTABLE_CHANGE) return `${label} was about the same (${previous} to ${current}).`;
  return diff > 0
    ? `${label} rose ${diff} points (${previous} to ${current}).`
    : `${label} fell ${-diff} points (${previous} to ${current}).`;
}

/**
 * Sentences built only from the backend's own trend figures, which are already
 * null until there is enough history to compare. Small moves say nothing.
 */
export function trendInsights(trends: Trends): string[] {
  return DIMENSIONS.flatMap(({ key, label }) => {
    const delta = trends[key];
    return delta !== null && Math.abs(delta) >= NOTABLE_CHANGE ? [{ label, delta }] : [];
  })
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 3)
    .map(({ label, delta }) =>
      delta > 0
        ? `Your ${label.toLowerCase()} scores are up ${delta} points in your latest sessions compared with the ones before.`
        : `Your ${label.toLowerCase()} scores are down ${-delta} points in your latest sessions compared with the ones before.`,
    );
}
