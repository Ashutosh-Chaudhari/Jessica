import type { ReactNode } from "react";
import { formatDate } from "../hooks/format";
import { NOTABLE_CHANGE, describeChange, groupFeedback } from "../hooks/sessions";

/**
 * The report's sections. They present what the scorer returned and what is
 * stored - no section adds a measurement of its own.
 */

/* --------------------------------------------------------------- feedback */

function NoteList({ lines, mark }: { lines: string[]; mark: string }) {
  return (
    <ul className="mt-2">
      {lines.map((line) => (
        <li key={line} className="flex gap-4 border-b border-line py-5">
          <span aria-hidden="true" className={`mt-2 h-2 w-2 shrink-0 ${mark}`} />
          <p className="prose-body text-[1.0625rem]">{line}</p>
        </li>
      ))}
    </ul>
  );
}

/**
 * Jessica's notes. What to change next is set large - it is the point of the
 * report - with what already worked beside it. A note that is not clearly
 * either goes under "Also noted" rather than under a heading it may not fit.
 * Every line is shown exactly as the scorer wrote it.
 */
export function FeedbackColumns({ feedback }: { feedback: string[] }) {
  const { improve, worked, other } = groupFeedback(feedback);
  if (feedback.length === 0) return null;
  const side = worked.length > 0 || other.length > 0;

  return (
    <div className={`grid gap-12 ${improve.length && side ? "lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-14" : ""}`}>
      {improve.length > 0 && (
        <section aria-labelledby="improve-next" className="min-w-0">
          <div className="flex items-end justify-between gap-4 border-b-2 border-amber pb-3">
            <h2 id="improve-next" className="display text-[clamp(2rem,4vw,3rem)]">
              Improve next
            </h2>
            <span className="font-mono text-xs uppercase tracking-[0.12em] text-amber-text">
              {improve.length} to work on
            </span>
          </div>
          <ul className="mt-2">
            {improve.map((line) => (
              <li key={line} className="flex gap-5 border-b border-line py-6">
                <span aria-hidden="true" className="mt-2 h-3 w-3 shrink-0 bg-amber" />
                <p className="headline text-[clamp(1.25rem,2.2vw,1.625rem)] font-semibold leading-snug">{line}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {side && (
        <div className="min-w-0 space-y-10">
          {worked.length > 0 && (
            <section aria-labelledby="did-well">
              <div className="border-b border-rule pb-3">
                <h2 id="did-well" className="eyebrow text-fg">
                  What you did well
                </h2>
              </div>
              <NoteList lines={worked} mark="bg-signal" />
            </section>
          )}
          {other.length > 0 && (
            <section aria-labelledby="also-noted">
              <div className="border-b border-rule pb-3">
                <h2 id="also-noted" className="eyebrow text-fg">
                  Also noted
                </h2>
              </div>
              <NoteList lines={other} mark="border border-control" />
            </section>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ comparison */

export interface ComparedScore {
  label: string;
  now: number;
  before: number | null;
}

function MiniBar({ value, tone }: { value: number; tone: "now" | "before" }) {
  return (
    <span aria-hidden="true" className="block h-2 w-full bg-line">
      <span
        className={`grow-in block h-full ${tone === "now" ? "bg-signal" : "bg-faint"}`}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </span>
  );
}

/**
 * Previous attempt against this one, dimension by dimension, from the two
 * stored score sets. "What changed" names only the moves big enough to mean
 * something - the threshold is the same one the trend sentences use.
 */
export function RetryComparison({
  scores,
  previousDate,
  currentDate,
}: {
  scores: ComparedScore[];
  previousDate: string;
  currentDate: string;
}) {
  const changes = scores
    .flatMap((s) => (s.before !== null && Math.abs(s.now - s.before) >= NOTABLE_CHANGE ? [s as Required<ComparedScore>] : []))
    .sort((a, b) => Math.abs(b.now - b.before!) - Math.abs(a.now - a.before!))
    .slice(0, 3)
    .map((s) => describeChange(s.label, s.before!, s.now));

  return (
    <section aria-labelledby="retry-comparison">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-rule pb-2.5">
        <h2 id="retry-comparison" className="eyebrow text-fg">
          Previous attempt vs current attempt
        </h2>
        <span className="font-mono text-xs text-muted">
          {formatDate(previousDate)} → {formatDate(currentDate)}
        </span>
      </div>

      <div className="mt-2">
        <div
          aria-hidden="true"
          className="grid grid-cols-[7rem_1fr_1fr_3.5rem] gap-x-5 border-b border-line py-3 font-mono text-xs uppercase tracking-[0.12em] text-faint max-sm:hidden"
        >
          <span />
          <span>Previous</span>
          <span>Current</span>
          <span className="text-right">Change</span>
        </div>
        <dl>
          {scores.map((s) => {
            const diff = s.before === null ? null : s.now - s.before;
            const notable = diff !== null && Math.abs(diff) >= NOTABLE_CHANGE;
            return (
              <div
                key={s.label}
                className="grid grid-cols-[1fr_auto] items-center gap-x-5 gap-y-2 border-b border-line py-4 sm:grid-cols-[7rem_1fr_1fr_3.5rem]"
              >
                <dt className="font-mono text-sm font-semibold uppercase tracking-[0.1em] max-sm:col-span-1">
                  {s.label}
                </dt>
                <dd
                  className={`tabular font-mono text-sm sm:order-last sm:text-right ${
                    !notable ? "text-muted" : diff! > 0 ? "text-signal-text" : "text-amber-text"
                  }`}
                >
                  {diff === null ? "—" : diff > 0 ? `+${diff}` : diff}
                  <span className="sr-only">{notable ? " points" : " points, about the same"}</span>
                </dd>
                <dd className="flex items-center gap-3 max-sm:col-span-2">
                  <span className="w-16 shrink-0 font-mono text-xs uppercase text-faint sm:hidden">Previous</span>
                  <MiniBar value={s.before ?? 0} tone="before" />
                  <span className="tabular w-8 shrink-0 text-right font-mono text-sm text-muted">{s.before ?? "—"}</span>
                </dd>
                <dd className="flex items-center gap-3 max-sm:col-span-2">
                  <span className="w-16 shrink-0 font-mono text-xs uppercase text-faint sm:hidden">Current</span>
                  <MiniBar value={s.now} tone="now" />
                  <span className="tabular w-8 shrink-0 text-right font-mono text-sm font-bold">{s.now}</span>
                </dd>
              </div>
            );
          })}
        </dl>
      </div>

      <h3 className="eyebrow mt-8 text-fg">What changed</h3>
      <ul className="mt-3 space-y-2">
        {changes.length > 0 ? (
          changes.map((line) => (
            <li key={line} className="flex gap-3 prose-body">
              <span aria-hidden="true" className="text-signal-text">
                →
              </span>
              {line}
            </li>
          ))
        ) : (
          <li className="prose-body text-muted">Every score was within {NOTABLE_CHANGE - 1} points of last time.</li>
        )}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------- structure */

/** A sequence, so it is numbered: each step only works after the one before. */
const STRUCTURE = [
  { head: "State your position", body: "Answer the question in one sentence, first." },
  { head: "Explain why", body: "Give the reason that matters most, not every reason." },
  { head: "Give an example", body: "One concrete case, fact or story that shows it." },
  { head: "Conclude", body: "Say your position again, sharper for what you have shown." },
];

export function StructureGuide() {
  return (
    <section aria-labelledby="structure-guide">
      <div className="flex items-end justify-between gap-4 border-b border-rule pb-2.5">
        <h2 id="structure-guide" className="eyebrow text-fg">
          How you could structure it
        </h2>
        <span className="font-mono text-xs text-muted max-sm:hidden">a shape, not a script</span>
      </div>
      <ol className="grid sm:grid-cols-2 lg:grid-cols-4">
        {STRUCTURE.map((step, i) => (
          <li
            key={step.head}
            className={`border-b border-line py-6 sm:pr-6 ${i > 0 ? "lg:border-l lg:pl-6" : ""} ${
              i % 2 === 1 ? "sm:border-l sm:pl-6" : ""
            }`}
          >
            <span className="numeral block text-[2.5rem] text-signal-ink">{String(i + 1).padStart(2, "0")}</span>
            <p className="mt-4 font-display text-lg font-bold uppercase tracking-[-0.01em]">{step.head}</p>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">{step.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ------------------------------------------------------------ transcript */

export function TranscriptPanel({
  transcript,
  open,
  onToggle,
}: {
  transcript: string;
  open: boolean;
  onToggle: () => void;
}): ReactNode {
  return (
    <section aria-labelledby="transcript-head">
      <div className="flex min-h-12 items-center justify-between gap-4 border-b border-rule">
        <h2 id="transcript-head" className="eyebrow text-fg">
          Transcript
        </h2>
        {transcript && (
          <button
            onClick={onToggle}
            aria-expanded={open}
            aria-controls="transcript-body"
            className="inline-flex min-h-11 cursor-pointer items-center gap-3 font-mono text-xs font-semibold uppercase tracking-[0.12em] text-muted hover:text-fg"
          >
            {open ? "Collapse" : "Expand"}
            <span aria-hidden="true" className="w-4 text-center text-lg leading-none">
              {open ? "−" : "+"}
            </span>
          </button>
        )}
      </div>
      {!transcript ? (
        <p className="py-6 font-mono text-sm uppercase tracking-[0.12em] text-muted">Transcript unavailable</p>
      ) : (
        open && (
          <p id="transcript-body" className="reveal max-w-[68ch] py-8 text-lg leading-[1.8]">
            {transcript}
          </p>
        )
      )}
    </section>
  );
}
