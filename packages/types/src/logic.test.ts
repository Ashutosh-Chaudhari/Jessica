// Run: npm test   (node --test, no framework)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PASS_RULES,
  DURATION_OPTIONS,
  MAX_RECORDING_SECONDS,
  applyPassRules,
  computeLongestStreak,
  computeProgress,
  computeTotals,
  computeTrends,
  computeStreak,
  failMessage,
  isValidTopicText,
  normalizeTopic,
  parseEvaluation,
  passRulesFor,
  pickCategory,
  type ProgressRow,
} from "./logic.ts";

test("normalizeTopic makes punctuation/case differences identical (spec test 1)", () => {
  assert.equal(
    normalizeTopic("How does GPS work?"),
    normalizeTopic("  how  does GPS work!! "),
  );
  assert.notEqual(normalizeTopic("How does GPS work?"), normalizeTopic("Why was GPS built?"));
});

test("isValidTopicText rejects junk and preambles", () => {
  assert.ok(isValidTopicText("Why did the Roman Empire build such an extensive road network?"));
  assert.equal(isValidTopicText("Talk."), false);
  assert.equal(isValidTopicText("Sure! Here is a topic about the Roman Empire and its roads."), false);
  assert.equal(isValidTopicText("Explain roads.\nAlso mention bridges please."), false);
});

test("pickCategory follows the spec section 21 distribution", () => {
  assert.equal(pickCategory(0), "evergreen");
  assert.equal(pickCategory(0.29), "evergreen");
  assert.equal(pickCategory(0.31), "science_technology");
  assert.equal(pickCategory(0.999999), "future_scenarios");
});

const LONG = Array.from({ length: 80 }, (_, i) => `word${i}`).join(" ");

test("applyPassRules: backend decides, not the model (spec sections 38-39)", () => {
  assert.deepEqual(applyPassRules(120, LONG, 90), { passed: true, reason: null });
  assert.equal(applyPassRules(DEFAULT_PASS_RULES.min_duration_seconds - 1, LONG, 90).reason, "too_short");
  assert.equal(applyPassRules(120, "barely said anything", 90).reason, "not_enough_speech");
  assert.equal(applyPassRules(120, LONG, DEFAULT_PASS_RULES.min_relevance - 1).reason, "off_topic");
  // A perfect relevance score cannot rescue a 10-second recording.
  assert.equal(applyPassRules(10, LONG, 100).passed, false);
});

test("shared constants survive module init (a bundler import cycle once broke this)", () => {
  assert.equal(DEFAULT_PASS_RULES.min_duration_seconds, 45);
  assert.match(failMessage("too_short"), /45 seconds/);
});

test("the pass bar moves with the length the speaker picked", () => {
  // The whole point of the shorter options: a 25-second answer has to be able
  // to pass a 30-second challenge, and still fail a two-minute one.
  const short = Array.from({ length: 30 }, (_, i) => `word${i}`).join(" ");
  assert.equal(applyPassRules(25, short, 90, passRulesFor(30)).passed, true);
  assert.equal(applyPassRules(25, short, 90, passRulesFor(120)).reason, "too_short");

  // Unknown lengths get the strictest rules, never the most lenient.
  assert.deepEqual(passRulesFor(7), DEFAULT_PASS_RULES);
  assert.deepEqual(passRulesFor(0), DEFAULT_PASS_RULES);

  // Every option has to be reachable: min duration under the limit, and a word
  // count that fits in it at a plausible 130 words per minute.
  for (const option of DURATION_OPTIONS) {
    assert.ok(option.rules.min_duration_seconds < option.seconds, option.label);
    assert.ok(
      option.rules.min_transcript_words <= (option.rules.min_duration_seconds / 60) * 130,
      option.label,
    );
  }
  // The ceiling the Worker enforces is the longest option, not a separate number.
  assert.equal(MAX_RECORDING_SECONDS, 120);
  assert.equal(failMessage("too_short", passRulesFor(30)), failMessage("too_short", passRulesFor(30)));
  assert.match(failMessage("too_short", passRulesFor(30)), /20 seconds/);
});

test("parseEvaluation rejects unusable model output and clamps scores", () => {
  const good = {
    overall: 82, fluency: 78, coherence: 86, vocabulary: 74,
    relevance: 91, structure: 83, filler_count: 7, feedback: ["Good focus."],
  };
  assert.deepEqual(parseEvaluation(good), { ...good });
  assert.equal(parseEvaluation({ ...good, coherence: undefined }), null);
  assert.equal(parseEvaluation({ ...good, feedback: [] }), null);
  assert.equal(parseEvaluation("not json"), null);
  assert.equal(parseEvaluation({ ...good, overall: 900 })?.overall, 100);
  assert.equal(parseEvaluation({ ...good, filler_count: "x" })?.filler_count, 0);
});

function row(
  day: string,
  status: ProgressRow["status"],
  score = 80,
  dur = 100,
  challenge_id = `c-${day}`,
): ProgressRow {
  return {
    created_at: `${day}T10:00:00.000Z`,
    challenge_id,
    duration_seconds: dur,
    overall_score: score,
    status,
  };
}

/** n passed attempts, newest first, each with the given fluency score. */
function fluencyRows(scores: number[]): ProgressRow[] {
  return scores.map((fluency_score, i) => ({
    created_at: `2026-08-${String(27 - i).padStart(2, "0")}T10:00:00.000Z`,
    challenge_id: `c${i}`,
    duration_seconds: 100,
    overall_score: 80,
    fluency_score,
    status: "passed" as const,
  }));
}
const NOW = new Date("2026-08-27T12:00:00.000Z");

test("computeStreak counts consecutive UTC days and tolerates a quiet today", () => {
  assert.equal(computeStreak([row("2026-08-27", "passed"), row("2026-08-26", "passed")], NOW), 2);
  // Nothing today yet, but yesterday counts - the streak is still alive.
  assert.equal(computeStreak([row("2026-08-26", "passed"), row("2026-08-25", "passed")], NOW), 2);
  // A missed day breaks it.
  assert.equal(computeStreak([row("2026-08-26", "passed"), row("2026-08-24", "passed")], NOW), 1);
  // Failed attempts do not extend a streak.
  assert.equal(computeStreak([row("2026-08-27", "failed")], NOW), 0);
  assert.equal(computeStreak([], NOW), 0);
});

test("computeLongestStreak finds the best run anywhere in history", () => {
  const rows = [
    row("2026-08-27", "passed"),
    // a 3-day run back in June, longer than the current 1-day one
    row("2026-06-03", "passed"), row("2026-06-02", "passed"), row("2026-06-01", "passed"),
    row("2026-05-20", "failed"), // failures never count
  ];
  assert.equal(computeLongestStreak(rows), 3);
  assert.equal(computeLongestStreak([]), 0);
  // Two attempts on the same day are one day, not two.
  assert.equal(computeLongestStreak([row("2026-08-27", "passed"), row("2026-08-27", "passed")]), 1);
});

test("computeTrends compares the recent window with the one before it", () => {
  // newest 5 average 90, previous 5 average 70 -> +20
  assert.equal(computeTrends(fluencyRows([90, 90, 90, 90, 90, 70, 70, 70, 70, 70])).fluency, 20);
  assert.equal(computeTrends(fluencyRows([70, 70, 70, 70, 70, 90, 90, 90, 90, 90])).fluency, -20);
  // Not enough history is null, NOT zero - "no data" must not render as "no change".
  assert.equal(computeTrends(fluencyRows([90, 90, 90])).fluency, null);
  assert.equal(computeTrends([]).fluency, null);
  // A dimension the rows carry no scores for stays null.
  assert.equal(computeTrends(fluencyRows([90, 90, 90, 90, 90, 70, 70])).coherence, null);
});

test("computeTrends does not depend on the caller sorting rows", () => {
  const rows = fluencyRows([90, 90, 90, 90, 90, 70, 70, 70, 70, 70]);
  assert.equal(computeTrends([...rows].reverse()).fluency, 20);
});

test("computeTotals counts topics, not attempts", () => {
  // Five topics, each failed once then passed: 10 attempts, but every topic
  // was both completed AND retried. Per-attempt maths would call this 50/50.
  const rows = ["a", "b", "c", "d", "e"].flatMap((id, i) => [
    row(`2026-08-${20 + i}`, "passed", 80, 100, id),
    row(`2026-08-${20 + i}`, "failed", 30, 40, id),
  ]);
  const totals = computeTotals(rows, NOW);

  assert.equal(totals.total_attempts, 10);
  assert.equal(totals.topics_attempted, 5);
  assert.equal(totals.topics_passed, 5);
  assert.equal(totals.topics_retried, 5);

  const stats = computeProgress(rows, totals);
  assert.equal(stats.completion_rate, 100);
  assert.equal(stats.retry_rate, 100); // not the complement of completion
});

test("completion and retry rates are independent, so they never fake a 101% split", () => {
  // Three topics: one passed first time, one needed a retry, one still failing.
  const rows = [
    row("2026-08-27", "passed", 90, 100, "first-time"),
    row("2026-08-26", "passed", 70, 100, "eventually"),
    row("2026-08-26", "failed", 30, 40, "eventually"),
    row("2026-08-25", "failed", 20, 30, "still-stuck"),
  ];
  const stats = computeProgress(rows, computeTotals(rows, NOW));
  assert.equal(stats.completion_rate, 67); // 2 of 3 topics
  assert.equal(stats.retry_rate, 33); //     1 of 3 topics
});

test("computeProgress counts speaking time from every attempt, scores from passes only", () => {
  const rows = [row("2026-08-27", "passed", 90, 100, "x"), row("2026-08-26", "failed", 40, 50, "y")];
  const stats = computeProgress(rows, computeTotals(rows, NOW));

  assert.deepEqual(stats, {
    completed_topics: 1,
    average_score: 90,
    speaking_time_seconds: 150,
    current_streak_days: 1,
    best_score: 90,
    total_attempts: 2,
    longest_streak_days: 1,
    completion_rate: 50, // 1 of 2 topics passed
    retry_rate: 0, //      neither topic was attempted twice
    trends: { fluency: null, coherence: null, vocabulary: null, relevance: null, structure: null },
  });
});

test("computeProgress rates are 0 rather than NaN with no attempts", () => {
  const stats = computeProgress([], computeTotals([], NOW));
  assert.equal(stats.completion_rate, 0);
  assert.equal(stats.retry_rate, 0);
  assert.equal(stats.average_score, 0);
  assert.equal(stats.total_attempts, 0);
  assert.equal(stats.longest_streak_days, 0);
});

test("all-time figures come from totals, not from the recent window", () => {
  const everything = Array.from({ length: 40 }, (_, i) =>
    row(`2026-07-${String(1 + (i % 28)).padStart(2, "0")}`, "passed", 60 + i, 100, `topic-${i}`),
  );
  // The Worker hands computeProgress only a page of recent rows; the totals are
  // counted server-side over the lot. The stats must reflect the lot.
  const stats = computeProgress(everything.slice(0, 5), computeTotals(everything, NOW));
  assert.equal(stats.total_attempts, 40);
  assert.equal(stats.completed_topics, 40);
  assert.equal(stats.best_score, 99);
});
