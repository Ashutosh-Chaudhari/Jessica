import { test } from "node:test";
import assert from "node:assert/strict";
import type { HistoryEntry } from "@jessica/types";
import {
  describeChange,
  lastDays,
  lastWeeks,
  previousAttempt,
  groupFeedback,
  trendInsights,
  weekStart,
} from "./sessions.ts";

function entry(id: string, created_at: string, over: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    id,
    challenge_id: "c1",
    topic_text: "t",
    duration_seconds: 60,
    transcript: "",
    overall_score: 60,
    fluency_score: 60,
    coherence_score: 60,
    vocabulary_score: 60,
    relevance_score: 60,
    structure_score: 60,
    filler_count: 0,
    feedback: [],
    status: "passed",
    created_at,
    ...over,
  };
}

test("weeks start on Monday, so Sunday belongs to the week before", () => {
  assert.equal(weekStart(new Date("2026-10-04T23:00:00Z")), "2026-09-28"); // Sunday
  assert.equal(weekStart(new Date("2026-10-05T00:00:00Z")), "2026-10-05"); // Monday
});

test("lastWeeks keeps empty weeks and drops sessions outside the window", () => {
  const now = new Date("2026-10-01T12:00:00Z");
  const weeks = lastWeeks(
    [entry("a", "2026-09-30T10:00:00Z"), entry("b", "2026-09-16T10:00:00Z"), entry("old", "2026-01-01T10:00:00Z")],
    3,
    now,
  );
  assert.deepEqual(
    weeks.map((w) => [w.start, w.entries.map((e) => e.id)]),
    [
      ["2026-09-14", ["b"]],
      ["2026-09-21", []],
      ["2026-09-28", ["a"]],
    ],
  );
});

test("lastDays counts sessions per UTC day, oldest first", () => {
  const days = lastDays(
    [entry("a", "2026-10-01T01:00:00Z"), entry("b", "2026-10-01T22:00:00Z"), entry("c", "2026-09-29T09:00:00Z")],
    3,
    new Date("2026-10-01T12:00:00Z"),
  );
  assert.deepEqual(days, [
    { day: "2026-09-29", count: 1 },
    { day: "2026-09-30", count: 0 },
    { day: "2026-10-01", count: 2 },
  ]);
});

test("previousAttempt is the latest earlier scored attempt at the same topic", () => {
  const current = entry("now", "2026-10-01T10:00:00Z");
  const history = [
    current,
    entry("first", "2026-09-01T10:00:00Z"),
    entry("second", "2026-09-10T10:00:00Z"),
    entry("unscored", "2026-09-20T10:00:00Z", { overall_score: null, status: "processing_error" }),
    entry("other-topic", "2026-09-25T10:00:00Z", { challenge_id: "c2" }),
  ];
  assert.equal(previousAttempt(history, current)?.id, "second");
  assert.equal(previousAttempt([current], current), null);
});

test("small differences are not reported as change", () => {
  assert.equal(describeChange("Fluency", 70, 73), "Fluency was about the same (70 to 73).");
  assert.equal(describeChange("Fluency", 70, 76), "Fluency rose 6 points (70 to 76).");
  assert.equal(describeChange("Fluency", 76, 70), "Fluency fell 6 points (76 to 70).");
});

test("insights only speak about trends the backend could compute", () => {
  const lines = trendInsights({ fluency: null, coherence: 2, vocabulary: -5, relevance: 0, structure: 9 });
  assert.equal(lines.length, 2);
  assert.match(lines[0]!, /structure scores are up 9/);
  assert.match(lines[1]!, /vocabulary scores are down 5/);
});

test("clear instructions and clean praise are sorted, word for word", () => {
  const notes = [
    "You stated your main point early and supported it with a concrete example.",
    "Steady pace that was easy to follow.",
    "Structure was clear, with a recognisable opening, development and close.",
    "Use of concrete examples made it easy to picture.",
    "Use clearer transitions between your second and third ideas.",
    "Several long sentences made the middle harder to follow; split them.",
    "A stronger closing sentence would make the answer feel complete.",
    "Watch the filler words in your second point.",
  ];
  assert.deepEqual(groupFeedback(notes), {
    worked: notes.slice(0, 4),
    improve: notes.slice(4),
    other: [],
  });
  assert.deepEqual(groupFeedback([]), { improve: [], worked: [], other: [] });
});

test("feedback is never filed under the opposite heading", () => {
  // Criticism with no instruction in it, and praise that is hedged or
  // negated: neither is safe to put under a polarity heading.
  const unsure = [
    "Your conclusion was a little weak.",
    "There were quite a few filler words, especially 'um' and 'like'.",
    "Your answer ended abruptly without summarising your main point.",
    "The second half wandered away from the question.",
    "You stayed on topic and did not drift.",
    "Your pacing was never too fast, and nothing felt repetitive.",
    "You didn't lose the thread even when you paused.",
    "We could not hear any speech in that recording.",
  ];
  const grouped = groupFeedback(unsure);
  assert.deepEqual(grouped.worked, []);
  assert.deepEqual(grouped.improve, []);
  assert.deepEqual(grouped.other, unsure);
});
