import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import type { HistoryEntry } from "@jessica/types";
import { api } from "../services";
import { Layout } from "../components/Layout";
import {
  Arrow,
  Button,
  Eyebrow,
  LoadingState,
  PageHeader,
  StatePanel,
  buttonClass,
} from "../components/primitives";
import { AttemptSummary } from "../components/attempt";
import { DIMENSIONS, groupFeedback } from "../hooks/sessions";

type Filter = "all" | "completed" | "retry";

const FILTERS: { value: Filter; label: string; match: (e: HistoryEntry) => boolean }[] = [
  { value: "all", label: "All", match: () => true },
  { value: "completed", label: "Completed", match: (e) => e.status === "passed" },
  // Everything that did not pass: failed answers and the rare unscored one.
  { value: "retry", label: "Retry", match: (e) => e.status !== "passed" },
];

function Expanded({ entry }: { entry: HistoryEntry }) {
  const { improve, worked, other } = groupFeedback(entry.feedback);

  return (
    <div
      id={`attempt-${entry.id}`}
      className="reveal grid gap-10 border-t border-line bg-surface px-5 py-8 sm:px-8 lg:grid-cols-[minmax(0,1fr)_17rem] lg:gap-12"
    >
      <div className="min-w-0">
        <Eyebrow>Transcript</Eyebrow>
        {entry.transcript ? (
          <p className="mt-3 max-w-[68ch] text-[1.0625rem] leading-[1.75]">{entry.transcript}</p>
        ) : (
          <p className="mt-3 font-mono text-sm uppercase tracking-[0.12em] text-muted">Transcript unavailable</p>
        )}

        {improve.length > 0 && (
          <>
            <Eyebrow className="mt-8 text-amber-text">Improve next</Eyebrow>
            <ul className="mt-3 space-y-3">
              {improve.map((f) => (
                <li key={f} className="flex gap-3 font-display text-[1.0625rem] font-semibold leading-snug">
                  <span aria-hidden="true" className="mt-1.5 h-2.5 w-2.5 shrink-0 bg-amber" />
                  {f}
                </li>
              ))}
            </ul>
          </>
        )}
        {[
          { title: "What you did well", lines: worked, mark: "bg-signal" },
          { title: "Also noted", lines: other, mark: "border border-control" },
        ].map(
          (group) =>
            group.lines.length > 0 && (
              <div key={group.title}>
                <Eyebrow className="mt-8">{group.title}</Eyebrow>
                <ul className="mt-3 space-y-2.5">
                  {group.lines.map((f) => (
                    <li key={f} className="flex gap-3 prose-body text-muted">
                      <span aria-hidden="true" className={`mt-2.5 h-2 w-2 shrink-0 ${group.mark}`} />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            ),
        )}
      </div>

      <div>
        <Eyebrow>Your feedback</Eyebrow>
        <dl className="mt-3 border-t border-rule">
          {DIMENSIONS.map((d) => {
            const score = d.score(entry);
            return (
              <div key={d.key} className="flex items-baseline justify-between border-b border-line py-2.5">
                <dt className="font-mono text-sm uppercase tracking-[0.1em] text-muted">{d.label}</dt>
                <dd className="numeral text-xl">{score ?? "—"}</dd>
              </div>
            );
          })}
          <div className="flex items-baseline justify-between border-b border-line py-2.5">
            <dt className="font-mono text-sm uppercase tracking-[0.1em] text-muted">Filler words</dt>
            <dd className="numeral text-xl">{entry.filler_count ?? "—"}</dd>
          </div>
        </dl>
        {/* The report holds Retry when the topic can still be retried - an old
            attempt at a topic since passed or skipped cannot be. */}
        <Link to={`/result/${entry.id}`} className={`${buttonClass("outline")} mt-6 w-full`}>
          Open full report <Arrow />
        </Link>
      </div>
    </div>
  );
}

export default function History() {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  const load = useCallback(() => {
    setError(null);
    void api.progress
      .getHistory()
      .then(setEntries)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not load history."));
  }, []);

  useEffect(() => {
    document.title = "History - Jessica";
    load();
  }, [load]);

  const active = FILTERS.find((f) => f.value === filter)!;
  const shown = entries?.filter(active.match) ?? [];

  return (
    <Layout>
      <PageHeader
        eyebrow="Everything you have said"
        title="History"
        aside={
          entries && entries.length > 0 ? (
            <p className="font-mono text-xs uppercase tracking-[0.12em] text-muted">
              {entries.length >= 100 ? "Latest 100 sessions" : `${entries.length} session${entries.length === 1 ? "" : "s"}`}
            </p>
          ) : undefined
        }
      />

      {error && (
        <StatePanel
          tone="error"
          label="Not loaded"
          title="History is not here"
          className="mt-10"
          actions={
            <Button onClick={load}>
              Try again <Arrow />
            </Button>
          }
        >
          <p>{error}</p>
        </StatePanel>
      )}

      {entries === null && !error && <LoadingState label="Loading history" className="mt-6" />}

      {entries?.length === 0 && (
        <StatePanel
          title="No practice sessions yet"
          className="mt-10"
          actions={
            <Link to="/challenge" className={buttonClass("primary", "lg")}>
              Start practice <Arrow />
            </Link>
          }
        >
          <p>Your communication journey starts here.</p>
        </StatePanel>
      )}

      {entries && entries.length > 0 && (
        <>
          <div role="group" aria-label="Filter sessions" className="mt-8 flex flex-wrap gap-2">
            {FILTERS.map((f) => {
              const pressed = filter === f.value;
              return (
                <button
                  key={f.value}
                  type="button"
                  aria-pressed={pressed}
                  onClick={() => setFilter(f.value)}
                  className={`inline-flex h-11 cursor-pointer items-center gap-3 border px-4 font-mono text-xs font-semibold uppercase tracking-[0.12em] transition-colors ${
                    pressed ? "border-fg bg-fg text-bg" : "border-control text-muted hover:border-fg hover:text-fg"
                  }`}
                >
                  {f.label}
                  <span className={`tabular font-normal ${pressed ? "" : "text-faint"}`}>
                    {entries.filter(f.match).length}
                  </span>
                </button>
              );
            })}
          </div>

          {shown.length === 0 ? (
            <p className="mt-10 font-mono text-sm uppercase tracking-[0.12em] text-muted">
              Nothing under {active.label.toLowerCase()} yet.
            </p>
          ) : (
            <ul className="mt-6 border-t-2 border-rule">
              {shown.map((entry) => {
                const open = openId === entry.id;
                return (
                  <li key={entry.id} className="border-b border-line-strong">
                    <button
                      onClick={() => setOpenId(open ? null : entry.id)}
                      aria-expanded={open}
                      aria-controls={open ? `attempt-${entry.id}` : undefined}
                      className={`flex w-full cursor-pointer items-start gap-4 px-1 py-6 text-left transition-colors hover:bg-surface sm:gap-6 sm:px-4 ${
                        open ? "bg-surface" : ""
                      }`}
                    >
                      <AttemptSummary entry={entry} />
                      <span
                        aria-hidden="true"
                        className={`flex h-9 w-9 shrink-0 items-center justify-center border font-mono text-xl leading-none transition-colors ${
                          open ? "border-fg bg-fg text-bg" : "border-control text-muted"
                        }`}
                      >
                        {open ? "−" : "+"}
                      </span>
                    </button>

                    {open && <Expanded entry={entry} />}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </Layout>
  );
}
