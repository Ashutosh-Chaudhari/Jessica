import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import type { HistoryEntry, ProgressStats } from "@jessica/types";
import { api } from "../services";
import { Layout } from "../components/Layout";
import {
  Arrow,
  Button,
  LoadingState,
  PageHeader,
  SectionHead,
  Stat,
  StatGrid,
  StatePanel,
  buttonClass,
} from "../components/primitives";
import { LineChart, PracticeCalendar, Sparkline } from "../components/charts";
import { formatDay, formatDuration } from "../hooks/format";
import {
  DIMENSIONS,
  completedAverage,
  lastDays,
  lastWeeks,
  oldestFirst,
  trendInsights,
  weekStart,
} from "../hooks/sessions";

const WEEKS = 8;
const CALENDAR_WEEKS = 12;
/** The history endpoint returns at most this many sessions, newest first. */
const HISTORY_PAGE = 100;

/**
 * null is "not enough history to say", which is not the same as "no change".
 * Printing 0 there would be inventing a finding out of three data points.
 */
function Delta({ delta }: { delta: number | null }) {
  if (delta === null) return <span className="font-mono text-xs uppercase tracking-[0.1em] text-faint">not yet</span>;
  const tone = delta > 0 ? "text-signal-text" : delta < 0 ? "text-amber-text" : "text-muted";
  return (
    <span className={`tabular font-mono text-sm font-bold ${tone}`}>
      {delta > 0 ? `+${delta}` : delta}
    </span>
  );
}

function calendarDays(entries: HistoryEntry[], now = new Date()) {
  const first = new Date(`${weekStart(now)}T00:00:00.000Z`);
  first.setUTCDate(first.getUTCDate() - (CALENDAR_WEEKS - 1) * 7);
  const span = Math.floor((now.getTime() - first.getTime()) / 86_400_000) + 1;
  return lastDays(entries, span, now);
}

export default function Progress() {
  const [stats, setStats] = useState<ProgressStats | null>(null);
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    const fail = (e: unknown) => setError(e instanceof Error ? e.message : "Could not load your progress.");
    void api.progress.getStats().then(setStats).catch(fail);
    void api.progress.getHistory().then(setHistory).catch(fail);
  }, []);

  useEffect(() => {
    document.title = "Progress - Jessica";
    load();
  }, [load]);

  if (error || !stats || !history) {
    return (
      <Layout>
        <PageHeader eyebrow="Your progress" title="Progress" />
        {error ? (
          <StatePanel
            tone="error"
            label="Not loaded"
            title="Progress is not here"
            className="mt-10"
            actions={
              <Button onClick={load}>
                Try again <Arrow />
              </Button>
            }
          >
            <p>{error}</p>
          </StatePanel>
        ) : (
          <LoadingState label="Loading your progress" className="mt-6" />
        )}
      </Layout>
    );
  }

  if (stats.total_attempts === 0) {
    return (
      <Layout>
        <PageHeader eyebrow="Your progress" title="Progress" />
        <StatePanel
          title="Not enough data yet"
          className="mt-10"
          actions={
            <Link to="/challenge" className={buttonClass("primary", "lg")}>
              Start practice <Arrow />
            </Link>
          }
        >
          <p>Complete a few challenges to see your progress.</p>
        </StatePanel>
      </Layout>
    );
  }

  const weeks = lastWeeks(history, WEEKS);
  const days = calendarDays(history);
  const fortnight = days.slice(-14).filter((d) => d.count > 0).length;
  const scored = oldestFirst(history.filter((e) => e.overall_score !== null)).slice(-10);
  const insights = trendInsights(stats.trends);

  return (
    <Layout>
      <PageHeader
        eyebrow="Your progress"
        title="Progress"
        aside={
          <p className="font-mono text-xs uppercase tracking-[0.12em] text-muted">
            {stats.total_attempts} session{stats.total_attempts === 1 ? "" : "s"} so far
          </p>
        }
      />

      <section aria-label="Totals" className="mt-10">
        <SectionHead label="Totals" />
        <StatGrid cols={3}>
          <Stat label="Average score" value={stats.average_score ? String(stats.average_score) : "—"} accent />
          <Stat label="Best score" value={stats.best_score ? String(stats.best_score) : "—"} />
          <Stat label="Topics completed" value={String(stats.completed_topics)} />
          <Stat label="Total time spoken" value={formatDuration(stats.speaking_time_seconds)} />
          <Stat label="Current streak" value={`${stats.current_streak_days}d`} />
          <Stat label="Practised, last 14 days" value={`${fortnight}/14`} />
        </StatGrid>
      </section>

      {/* Only sentences the backend's own trend figures can back up. */}
      <section aria-labelledby="numbers-say" className="mt-16">
        <SectionHead id="numbers-say" label="What the numbers say" />
        {insights.length > 0 ? (
          <ul>
            {insights.map((line) => (
              <li key={line} className="flex gap-5 border-b border-line py-6">
                <span aria-hidden="true" className="mt-2.5 h-3 w-3 shrink-0 bg-signal" />
                <p className="headline max-w-3xl text-[clamp(1.25rem,2.4vw,1.75rem)] font-semibold">{line}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="max-w-2xl py-6 prose-body text-muted">
            Nothing stands out yet. Trends appear once there are enough sessions to compare your
            latest ones with the ones before.
          </p>
        )}
      </section>

      <div className="mt-16 grid gap-14 lg:grid-cols-2 lg:gap-12">
        <section aria-label="Weekly score trend" className="min-w-0">
          <SectionHead label="Weekly score trend" title={`last ${WEEKS} weeks`} />
          <div className="mt-6">
            <LineChart
              title="Average of completed sessions"
              max={100}
              valueHead="Average"
              points={weeks.map((w) => {
                const avg = completedAverage(w.entries);
                const done = w.entries.filter((e) => e.status === "passed").length;
                return {
                  label: formatDay(w.start),
                  value: avg,
                  detail: avg === null ? "no completed sessions" : `${avg} avg · ${done} completed`,
                };
              })}
            />
          </div>
        </section>

        <section aria-label="Speaking-time trend" className="min-w-0">
          <SectionHead label="Speaking-time trend" title={`last ${WEEKS} weeks`} />
          <div className="mt-6">
            <LineChart
              title="Minutes spoken"
              valueHead="Spoken"
              points={weeks.map((w) => {
                const seconds = w.entries.reduce((s, e) => s + e.duration_seconds, 0);
                return {
                  label: formatDay(w.start),
                  value: seconds > 0 ? Math.round((seconds / 60) * 10) / 10 : null,
                  detail:
                    seconds > 0
                      ? `${formatDuration(seconds)} · ${w.entries.length} session${w.entries.length === 1 ? "" : "s"}`
                      : "no sessions",
                };
              })}
            />
          </div>
        </section>
      </div>

      <div className="mt-16 grid gap-14 lg:grid-cols-[auto_minmax(0,1fr)] lg:gap-16">
        <section aria-label="Practice frequency" className="min-w-0">
          <SectionHead label="Practice frequency" title={`${CALENDAR_WEEKS} weeks`} />
          <div className="mt-6">
            <PracticeCalendar days={days} />
          </div>
        </section>

        <section aria-label="Communication dimensions" className="min-w-0">
          <SectionHead label="Communication dimensions" title="last 10 scored" />
          <div>
            <div className="grid grid-cols-[6.5rem_1fr_2.5rem_3.5rem] gap-4 border-b border-line py-3 font-mono text-xs uppercase tracking-[0.1em] text-faint sm:grid-cols-[8.5rem_1fr_3rem_4rem]">
              <span />
              <span>0 – 100</span>
              <span className="text-right">Latest</span>
              <span className="text-right">Trend</span>
            </div>
            {DIMENSIONS.map((d) => {
              const values = scored.map(d.score).filter((v): v is number => v !== null);
              return (
                <div
                  key={d.key}
                  className="grid grid-cols-[6.5rem_1fr_2.5rem_3.5rem] items-center gap-4 border-b border-line py-4 sm:grid-cols-[8.5rem_1fr_3rem_4rem]"
                >
                  <span className="font-mono text-sm font-semibold uppercase tracking-[0.1em]">{d.label}</span>
                  <Sparkline label={d.label} values={values} />
                  <span className="numeral text-right text-xl">{values.at(-1) ?? "—"}</span>
                  <span className="text-right">
                    <Delta delta={stats.trends[d.key]} />
                  </span>
                </div>
              );
            })}
            <p className="mt-4 font-mono text-xs text-muted">
              Trend is your latest sessions against the ones before them, in points.
            </p>
          </div>
        </section>
      </div>

      <section aria-label="All time" className="mt-16 max-w-xl">
        <SectionHead label="All time" title="every topic you have been given" />
        <dl>
          {[
            ["Attempts", String(stats.total_attempts)],
            ["Topics passed", `${stats.completion_rate}%`],
            ["Needed a retry", `${stats.retry_rate}%`],
            ["Longest streak", `${stats.longest_streak_days}d`],
          ].map(([label, value]) => (
            <div key={label} className="flex items-baseline justify-between gap-4 border-b border-line py-3">
              <dt className="font-mono text-sm uppercase tracking-[0.1em] text-muted">{label}</dt>
              <dd className="numeral text-xl">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {history.length >= HISTORY_PAGE && (
        <p className="mt-8 font-mono text-xs text-muted">
          Charts use your latest {HISTORY_PAGE} sessions. Totals count everything.
        </p>
      )}
    </Layout>
  );
}
