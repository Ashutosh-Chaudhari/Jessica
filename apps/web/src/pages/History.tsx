import { useEffect, useState } from "react";
import { Link } from "react-router";
import type { HistoryEntry } from "@jessica/types";
import { api } from "../services";
import { Layout } from "../components/Layout";
import { Button, Eyebrow, Slab } from "../components/primitives";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function History() {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = "History - Jessica";
    void api.progress
      .getHistory()
      .then(setEntries)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not load history."));
  }, []);

  return (
    <Layout>
      <div className="border-b-2 rule pb-8">
        <Eyebrow>Everything you have said</Eyebrow>
        <h1 className="display mt-3 text-5xl sm:text-6xl">History</h1>
      </div>

      {error && (
        <p className="mt-8 border-l-4 border-live bg-surface px-3 py-2 font-mono text-sm text-live-text">
          {error}
        </p>
      )}

      {entries === null && !error && (
        <p className="mt-8 font-mono text-sm uppercase tracking-[0.1em] text-muted">Loading…</p>
      )}

      {entries?.length === 0 && (
        <Slab className="mt-8 p-12">
          <p className="display text-3xl">Nothing here yet</p>
          <p className="mt-3 max-w-md prose-body text-muted">
            Your first topic is one click away, and you cannot prepare for it either way.
          </p>
          <Link to="/challenge" className="mt-8 inline-block">
            <Button>Start your first challenge</Button>
          </Link>
        </Slab>
      )}

      {entries && entries.length > 0 && (
        <ul className="mt-8 border-t-2 rule">
          {entries.map((entry) => {
            const open = openId === entry.id;
            const passed = entry.status === "passed";
            return (
              <li key={entry.id} className="border-b-2 rule">
                <button
                  onClick={() => setOpenId(open ? null : entry.id)}
                  aria-expanded={open}
                  className="grid w-full cursor-pointer grid-cols-[auto_1fr_auto] items-center gap-4 px-1 py-5 text-left hover:bg-surface"
                >
                  <span
                    className={`display tabular w-16 text-3xl ${passed ? "text-signal-text" : "text-amber-text"}`}
                  >
                    {passed ? entry.overall_score : "—"}
                  </span>
                  <span>
                    <span className="block font-display text-base font-bold leading-tight tracking-tight">
                      {entry.topic_text}
                    </span>
                    <span className="mt-1 block font-mono text-sm uppercase tracking-[0.1em] text-muted">
                      {formatDate(entry.created_at)} · {entry.duration_seconds}s ·{" "}
                      {passed ? "completed" : "retry"}
                    </span>
                  </span>
                  <span aria-hidden="true" className="font-mono text-lg text-muted">
                    {open ? "−" : "+"}
                  </span>
                </button>

                {open && (
                  <div className="border-t rule bg-surface px-1 py-5">
                    <Eyebrow>What you said</Eyebrow>
                    <p className="mt-2 prose-body">{entry.transcript}</p>

                    {entry.feedback.length > 0 && (
                      <>
                        <Eyebrow className="mt-6">Notes</Eyebrow>
                        <ul className="mt-2 space-y-2">
                          {entry.feedback.map((f) => (
                            <li
                              key={f}
                              className="border-l-4 border-signal pl-3 prose-body text-muted"
                            >
                              {f}
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Layout>
  );
}
