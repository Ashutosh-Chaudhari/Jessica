import { useEffect, useState } from "react";
import { Link } from "react-router";
import type { ProgressStats, TrendDimension } from "@jessica/types";
import { api } from "../services";
import { useAuth } from "../hooks/useAuth";
import { Layout } from "../components/Layout";
import { Button, Eyebrow, QuoteBlock, Readout, SectionHead, Slab } from "../components/primitives";
import { formatDuration } from "../hooks/format";

const DIMENSIONS: Record<TrendDimension, string> = {
  fluency: "Fluency",
  coherence: "Coherence",
  vocabulary: "Vocabulary",
  relevance: "Relevance",
  structure: "Structure",
};

/**
 * null is "not enough history to say", which is not the same as "no change".
 * Printing 0 there would be inventing a finding out of three data points.
 */
function Delta({ delta }: { delta: number | null }) {
  if (delta === null) return <span className="font-mono text-sm text-muted">not yet</span>;
  const tone = delta > 0 ? "text-signal-text" : delta < 0 ? "text-amber-text" : "text-muted";
  return (
    <span className={`tabular font-mono text-sm font-bold ${tone}`}>
      {delta > 0 ? `+${delta}` : delta}
    </span>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b rule py-2.5 last:border-0">
      <span className="font-mono text-sm uppercase tracking-[0.1em] text-muted">{label}</span>
      {value}
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<ProgressStats | null>(null);

  useEffect(() => {
    document.title = "Dashboard - Jessica";
    void api.progress
      .getStats()
      .then(setStats)
      .catch((e: unknown) => console.error("could not load progress:", e));
  }, []);

  const started = (stats?.total_attempts ?? 0) > 0;

  return (
    <Layout>
      <div className="border-b-2 rule pb-8">
        <Eyebrow>Welcome back</Eyebrow>
        <h1 className="display mt-3 text-5xl sm:text-6xl">{user?.display_name}</h1>
      </div>

      {stats && (
        <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Readout label="Topics done" value={String(stats.completed_topics)} accent />
          <Readout label="Average" value={stats.average_score ? String(stats.average_score) : "—"} />
          <Readout label="Time spoken" value={formatDuration(stats.speaking_time_seconds)} />
          <Readout label="Streak" value={`${stats.current_streak_days}d`} />
          <Readout label="Best" value={stats.best_score ? String(stats.best_score) : "—"} />
        </div>
      )}

      {/* The one action this page exists for. */}
      <Slab className="mt-10 p-8 sm:p-12">
        <Eyebrow>Next challenge</Eyebrow>
        <h2 className="display mt-3 text-3xl sm:text-4xl">
          One topic. Two minutes. No warning.
        </h2>
        <p className="mt-4 max-w-lg prose-body text-muted">
          You will not know the subject until the clock is on screen. Find somewhere you can
          speak out loud first.
        </p>
        <Link to="/challenge" className="mt-8 inline-block">
          <Button className="px-8 py-4 text-base">Start challenge</Button>
        </Link>
      </Slab>

      {stats && started && (
        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          <section>
            <SectionHead label="Recent trend" title="last few vs the ones before" />
            <div className="mt-4">
              {(Object.keys(DIMENSIONS) as TrendDimension[]).map((d) => (
                <Row key={d} label={DIMENSIONS[d]} value={<Delta delta={stats.trends[d]} />} />
              ))}
            </div>
          </section>

          <section>
            <SectionHead label="All time" title="every topic you have been given" />
            <div className="mt-4">
              <Row
                label="Attempts"
                value={<span className="tabular font-mono text-sm font-bold">{stats.total_attempts}</span>}
              />
              <Row
                label="Topics passed"
                value={<span className="tabular font-mono text-sm font-bold">{stats.completion_rate}%</span>}
              />
              <Row
                label="Needed a retry"
                value={<span className="tabular font-mono text-sm font-bold">{stats.retry_rate}%</span>}
              />
              <Row
                label="Longest streak"
                value={<span className="tabular font-mono text-sm font-bold">{stats.longest_streak_days}d</span>}
              />
            </div>
          </section>
        </div>
      )}

      <QuoteBlock seed={stats?.total_attempts ?? 0} className="mt-12" />
    </Layout>
  );
}
