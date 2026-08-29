/**
 * Written for Jessica rather than borrowed. Famous-quote wallpaper is both
 * generic and a misattribution risk, and none of it is about the specific
 * problem this app puts in front of you: a topic you did not choose and a
 * clock that has already started.
 *
 * Each line carries the thing it is about. That label is real information -
 * it tells you which fear the line addresses - not an ornamental index.
 */
export interface Line {
  on: string;
  text: string;
}

export const LINES: Line[] = [
  { on: "the clock", text: "The clock is not your enemy. The pause you are afraid of is." },
  { on: "starting", text: "You do not need the perfect first sentence. You need a first sentence." },
  { on: "fluency", text: "Fluency is not speed. It is not stopping." },
  { on: "filler", text: "Nobody remembers your filler words. They remember whether you got somewhere." },
  { on: "two minutes", text: "Two minutes is longer than you think and shorter than you fear." },
  { on: "clarity", text: "An unfinished thought said clearly beats a finished one mumbled." },
  { on: "structure", text: "Structure is what you fall back on when the nerves arrive." },
  { on: "openings", text: "Say the obvious thing first. It buys you time to say the interesting one." },
  { on: "being judged", text: "You are not scored on being right. You are scored on being followed." },
  { on: "the unknown", text: "The topic is unfamiliar on purpose. So is most of what you get asked in life." },
  { on: "silence", text: "Silence is a punctuation mark, not a failure." },
  { on: "audience", text: "Talk to one person, not to a room." },
];

/** Stable for a given seed, so a line does not change under the reader mid-task. */
export function lineFor(seed: number): Line {
  return LINES[Math.abs(Math.trunc(seed)) % LINES.length]!;
}
