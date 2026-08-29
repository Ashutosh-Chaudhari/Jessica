import { useEffect, useState } from "react";
import type { HistoryEntry } from "@jessica/types";
import { api } from "../services";
import { Layout } from "../components/Layout";
import { Card } from "../components/Card";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function History() {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    document.title = `History - Jessica`;
    void api.progress.getHistory().then(setEntries);
  }, []);

  return (
    <Layout>
      <h1 className="text-2xl font-semibold">History</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Every completed challenge stays here permanently.
      </p>

      <div className="mt-8 space-y-3">
        {entries === null && (
          <p className="font-mono text-sm text-zinc-600">loading…</p>
        )}

        {entries?.length === 0 && (
          <Card className="p-10 text-center">
            <p className="text-sm text-zinc-500">
              No challenges yet. Your first one is waiting.
            </p>
          </Card>
        )}

        {entries?.map((entry) => (
          <Card key={entry.id} className="overflow-hidden">
            <button
              onClick={() => setOpenId(openId === entry.id ? null : entry.id)}
              className="w-full cursor-pointer p-5 text-left transition-colors hover:bg-zinc-900"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-medium text-zinc-100">{entry.topic_text}</h2>
                <span
                  className={`rounded-full px-2 py-0.5 font-mono text-xs ${
                    entry.status === "passed"
                      ? "bg-emerald-950 text-emerald-300"
                      : "bg-amber-950/60 text-amber-300"
                  }`}
                >
                  {entry.status === "passed" ? `${entry.overall_score}` : "retry"}
                </span>
              </div>
              <p className="mt-2 font-mono text-xs text-zinc-600">
                {formatDate(entry.created_at)} · {entry.duration_seconds}s
              </p>
            </button>

            {openId === entry.id && (
              <div className="border-t border-zinc-800 px-5 py-4">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Transcript
                </h3>
                <p className="text-sm leading-relaxed text-zinc-300">
                  {entry.transcript}
                </p>
                {entry.feedback.length > 0 && (
                  <>
                    <h3 className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                      Feedback
                    </h3>
                    <ul className="list-inside list-disc space-y-1 text-sm text-zinc-400">
                      {entry.feedback.map((f) => (
                        <li key={f}>{f}</li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}
          </Card>
        ))}
      </div>
    </Layout>
  );
}
