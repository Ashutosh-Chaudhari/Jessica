import { Link } from "react-router";
import type { HistoryEntry } from "@jessica/types";
import { formatDate } from "../hooks/format";
import { outcomeOf, type Outcome } from "../hooks/sessions";

/** Blue is a completed score, amber is one to retry. The label always says which too. */
const OUTCOME_TEXT: Record<Outcome, string> = {
  done: "text-signal-text",
  retry: "text-amber-text",
  error: "text-muted",
};

const OUTCOME_MARK: Record<Outcome, string> = {
  done: "bg-signal",
  retry: "bg-amber",
  error: "border border-control",
};

/** "Completed" / "Retry" / "Not scored", with a mark so colour is never the only cue. */
function OutcomeLabel({ entry }: { entry: HistoryEntry }) {
  const outcome = outcomeOf(entry.status);
  return (
    <span
      className={`inline-flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-[0.12em] ${OUTCOME_TEXT[outcome.tone]}`}
    >
      <span aria-hidden="true" className={`h-2 w-2 ${OUTCOME_MARK[outcome.tone]}`} />
      {outcome.label}
    </span>
  );
}

function ScoreFigure({ entry, size }: { entry: HistoryEntry; size: "md" | "lg" }) {
  const outcome = outcomeOf(entry.status);
  return (
    <span
      className={`numeral shrink-0 ${size === "lg" ? "w-16 text-[2.75rem] sm:w-24 sm:text-[3.5rem]" : "w-12 text-3xl"} ${
        outcome.tone === "done" ? "text-signal-ink" : OUTCOME_TEXT[outcome.tone]
      }`}
    >
      <span className="sr-only">Score </span>
      {entry.overall_score ?? "—"}
    </span>
  );
}

/** Score, topic and the facts about one session - the summary line of a History row. */
export function AttemptSummary({ entry }: { entry: HistoryEntry }) {
  return (
    <>
      <ScoreFigure entry={entry} size="lg" />
      <span className="min-w-0 flex-1">
        <span className="headline line-clamp-2 text-lg sm:text-xl">{entry.topic_text}</span>
        <span className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs uppercase tracking-[0.12em] text-muted">
          <span>{formatDate(entry.created_at)}</span>
          <span aria-hidden="true">·</span>
          <span>{entry.duration_seconds}s</span>
          <span aria-hidden="true">·</span>
          <OutcomeLabel entry={entry} />
        </span>
      </span>
    </>
  );
}

const ROW = "grid grid-cols-[3rem_1fr] gap-x-4 md:grid-cols-[minmax(0,1fr)_4.5rem_7.5rem_4rem_8.5rem] md:items-center md:gap-x-5";

/**
 * The dashboard's last few sessions, ruled like a table on wide screens and
 * stacked on a phone. Each row is one link to the full report.
 */
export function RecentActivity({ entries }: { entries: HistoryEntry[] }) {
  return (
    <div>
      <div
        aria-hidden="true"
        className={`${ROW} border-b border-line py-3 font-mono text-xs uppercase tracking-[0.12em] text-faint max-md:hidden`}
      >
        <span>Topic</span>
        <span className="text-right">Score</span>
        <span>Date</span>
        <span className="text-right">Time</span>
        <span>Status</span>
      </div>
      <ul>
        {entries.map((entry) => (
          <li key={entry.id} className="border-b border-line">
            <Link
              to={`/result/${entry.id}`}
              className={`${ROW} group py-4 transition-colors hover:bg-surface max-md:grid-rows-[auto_auto]`}
            >
              <span className="headline line-clamp-2 text-base group-hover:text-signal-text max-md:col-start-2 max-md:row-start-1 md:line-clamp-1">
                {entry.topic_text}
              </span>
              <span className="max-md:col-start-1 max-md:row-span-2 max-md:row-start-1 md:text-right">
                <ScoreFigure entry={entry} size="md" />
              </span>
              <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 max-md:col-start-2 max-md:row-start-2 md:contents">
                <span className="whitespace-nowrap font-mono text-xs uppercase tracking-[0.1em] text-muted md:mt-0">
                  {formatDate(entry.created_at)}
                </span>
                <span className="tabular whitespace-nowrap font-mono text-xs text-muted md:text-right">
                  {entry.duration_seconds}s
                </span>
                <OutcomeLabel entry={entry} />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
