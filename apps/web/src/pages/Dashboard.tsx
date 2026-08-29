import { useEffect, useState } from "react";
import { Link } from "react-router";
import type { ProgressStats, TrendDimension } from "@jessica/types";
import { api } from "../services";
import { useAuth } from "../hooks/useAuth";
import { Layout } from "../components/Layout";
import { Button } from "../components/Button";
import { Card, Stat } from "../components/Card";
import { formatDuration } from "../hooks/format";

const DIMENSION_LABELS: Record<TrendDimension, string> = {
  fluency: "Fluency",
  coherence: "Coherence",
  vocabulary: "Vocabulary",
  relevance: "Relevance",
  structure: "Structure",
};

/**
 * null means "not enough history yet" and must not render as 0 - telling
 * someone their fluency is flat when we have three data points is a lie.
 */
function TrendChip({ label, delta }: { label: string; delta: number | null }) {
  const tone =
    delta === null
      ? "text-zinc-600"
      : delta > 0
        ? "text-emerald-300"
        : delta < 0
          ? "text-amber-400"
          : "text-zinc-400";

  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-zinc-800/70 py-2 last:border-0">
      <span className="text-sm text-zinc-400">{label}</span>
      <span className={`font-mono text-sm tabular-nums ${tone}`}>
        {delta === null ? "–" : delta > 0 ? `+${delta}` : delta}
      </span>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<ProgressStats | null>(null);

  useEffect(() => {
    document.title = `Dashboard - Jessica`;
    void api.progress
      .getStats()
      .then(setStats)
      .catch((e: unknown) => console.error("could not load progress:", e));
  }, []);

  const hasHistory = (stats?.total_attempts ?? 0) > 0;

  return (
    <Layout>
      <p className="text-sm text-zinc-500">Welcome back,</p>
      <h1 className="mt-1 text-2xl font-semibold">{user?.display_name}</h1>

      {stats && (
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Stat label="Completed Topics" value={String(stats.completed_topics)} />
          <Stat label="Average Score" value={stats.average_score ? String(stats.average_score) : "-"} />
          <Stat label="Speaking Time" value={formatDuration(stats.speaking_time_seconds)} />
          <Stat label="Current Streak" value={`${stats.current_streak_days}d`} />
          <Stat label="Best Score" value={stats.best_score ? String(stats.best_score) : "-"} />
        </div>
      )}

      <Card className="mt-10 p-10 text-center">
        <h2 className="text-lg font-medium">Ready for a new challenge?</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-zinc-500">
          You will get one unexpected topic. You have up to two minutes to
          speak about it.
        </p>
        <Link to="/challenge" className="mt-6 inline-block">
          <Button className="px-8 py-3 tracking-wide">START CHALLENGE</Button>
        </Link>
      </Card>

      {stats && hasHistory && (
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Card className="p-6">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Recent trend
            </h3>
            <p className="mt-1 text-xs text-zinc-600">
              Your last few answers against the ones before them.
            </p>
            <div className="mt-3">
              {(Object.keys(DIMENSION_LABELS) as TrendDimension[]).map((d) => (
                <TrendChip key={d} label={DIMENSION_LABELS[d]} delta={stats.trends[d]} />
              ))}
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              All time
            </h3>
            <p className="mt-1 text-xs text-zinc-600">Across every topic you have been given.</p>
            <dl className="mt-3">
              {[
                ["Attempts", String(stats.total_attempts)],
                ["Topics passed", `${stats.completion_rate}%`],
                ["Topics that needed a retry", `${stats.retry_rate}%`],
                ["Longest streak", `${stats.longest_streak_days}d`],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="flex items-baseline justify-between gap-3 border-b border-zinc-800/70 py-2 last:border-0"
                >
                  <dt className="text-sm text-zinc-400">{label}</dt>
                  <dd className="font-mono text-sm tabular-nums text-zinc-200">{value}</dd>
                </div>
              ))}
            </dl>
          </Card>
        </div>
      )}
    </Layout>
  );
}
