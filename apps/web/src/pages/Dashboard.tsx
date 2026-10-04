import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import type { ActiveChallenge, HistoryEntry, ProgressStats } from "@jessica/types";
import { CATEGORY_LABELS, DURATION_OPTIONS } from "@jessica/types";
import { api } from "../services";
import { useAuth } from "../hooks/useAuth";
import { Layout } from "../components/Layout";
import {
  Arrow,
  Button,
  Eyebrow,
  LoadingState,
  QuoteBlock,
  SectionHead,
  Stat,
  StatGrid,
  StatePanel,
  Tag,
  buttonClass,
} from "../components/primitives";
import { RecentActivity } from "../components/attempt";
import { LineChart } from "../components/charts";
import { MetaLine } from "../components/practice";
import { formatDay, formatDuration } from "../hooks/format";
import { dayKey, oldestFirst, outcomeOf, trendInsights } from "../hooks/sessions";

const LENGTHS = `${DURATION_OPTIONS[0]!.label} – ${DURATION_OPTIONS[DURATION_OPTIONS.length - 1]!.label}, you choose`;

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<ProgressStats | null>(null);
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);
  // undefined while it loads; null when no topic is waiting.
  const [current, setCurrent] = useState<ActiveChallenge | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    setFailed(false);
    void api.progress
      .getStats()
      .then(setStats)
      .catch((e: unknown) => {
        console.error("could not load progress:", e);
        setFailed(true);
      });
    void api.progress
      .getHistory()
      .then(setHistory)
      .catch((e: unknown) => {
        console.error("could not load history:", e);
        setFailed(true);
      });
    // Read-only: the topic already assigned, if there is one. Nothing is
    // generated here - a new topic is only ever chosen on the Practice screen.
    void api.challenges
      .getCurrent()
      .then(setCurrent)
      .catch(() => setCurrent(null));
  }, []);

  useEffect(() => {
    document.title = "Dashboard - Jessica";
    load();
  }, [load]);

  const started = (stats?.total_attempts ?? 0) > 0;
  const scored = oldestFirst((history ?? []).filter((e) => e.overall_score !== null)).slice(-10);
  const retrying = current?.status === "failed";
  const insights = stats ? trendInsights(stats.trends) : [];

  return (
    <Layout>
      {/* The welcome stays one line tall on a desk: the next challenge is the point. */}
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div className="min-w-0">
          <Eyebrow>Welcome back</Eyebrow>
          <h1 className="display mt-3 break-words text-[clamp(2.5rem,6.4vw,5rem)]">{user?.display_name}</h1>
          <p className="mt-3 max-w-xl prose-body text-muted">
            {started
              ? "Pick up where you left off. One topic, your clock, out loud."
              : "Find somewhere you can speak out loud. Your first topic is one click away."}
          </p>
        </div>
        <div className="font-mono text-xs uppercase tracking-[0.12em] text-muted sm:text-right">
          <p>{new Date().toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}</p>
          {stats && (
            <p className="mt-1 text-fg">
              Streak {stats.current_streak_days}d · {stats.completed_topics} done
            </p>
          )}
        </div>
      </header>

      {/* ---------------------------------------------------- next challenge */}
      <section aria-labelledby="next-challenge" className="mt-8 sm:mt-10">
        <div className="offset-signal mr-2.5 border-2 border-fg bg-surface">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-6 py-4 sm:px-8">
            <h2 id="next-challenge" className="eyebrow text-fg">
              Next challenge
            </h2>
            {current !== undefined && (
              <Tag tone={retrying ? "amber" : "signal"}>
                {current ? (retrying ? "Ready to retry" : "Waiting for you") : "New topic"}
              </Tag>
            )}
          </div>

          <div className="grid lg:grid-cols-[minmax(0,1fr)_19rem]">
            <div className="min-w-0 px-6 py-8 sm:px-8 sm:py-10">
              {current === undefined ? (
                <LoadingState label="Loading your next challenge" className="py-2" />
              ) : current ? (
                <>
                  <MetaLine items={[CATEGORY_LABELS[current.category], "Waiting since " + formatDay(dayKey(current.assigned_at))]} />
                  <p className="headline mt-5 max-w-[26ch] text-[clamp(1.75rem,3.4vw,2.75rem)]">
                    {current.topic_text}
                  </p>
                  <p className="mt-5 max-w-lg prose-body text-muted">
                    {retrying
                      ? "Your last answer did not pass. Same topic, a fresh attempt - your earlier report stays in History."
                      : "Speak naturally: make a clear point, explain it, give an example, then close."}
                  </p>
                </>
              ) : (
                <>
                  <MetaLine items={["Any subject", "Revealed when you start"]} />
                  <p className="display mt-5 text-[clamp(2.25rem,5vw,4rem)]">
                    One topic.
                    <br />
                    Your clock.
                    <br />
                    No warning.
                  </p>
                  <p className="mt-5 max-w-lg prose-body text-muted">
                    You will not know the subject until it is on screen. Find somewhere you can
                    speak out loud first.
                  </p>
                </>
              )}
            </div>

            <div className="flex min-w-0 flex-col justify-between gap-8 border-t border-line px-6 py-8 sm:px-8 lg:border-l lg:border-t-0 lg:py-10">
              <dl className="space-y-5">
                <div>
                  <dt className="eyebrow">Length</dt>
                  <dd className="mt-1.5 font-mono text-sm">{LENGTHS}</dd>
                </div>
                <div>
                  <dt className="eyebrow">Scored on</dt>
                  <dd className="mt-1.5 font-mono text-sm leading-relaxed">
                    Fluency, coherence, vocabulary, relevance, structure
                  </dd>
                </div>
              </dl>
              <Link
                to="/challenge"
                className={`${buttonClass(retrying ? "retry" : "primary", "lg")} w-full`}
              >
                {retrying ? "Retry challenge" : "Start practice"} <Arrow />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {failed && (
        <StatePanel
          tone="error"
          label="Not loaded"
          title="Your numbers are not here"
          className="mt-12"
          actions={
            <Button onClick={load}>
              Try again <Arrow />
            </Button>
          }
        >
          <p>Your stats or history did not load. Try again in a moment.</p>
        </StatePanel>
      )}

      {/* ------------------------------------------------------------ stats */}
      <section aria-label="Your stats" className="mt-14 sm:mt-16">
        <SectionHead label="Your stats" />
        {stats ? (
          <StatGrid>
            <Stat label="Topics done" value={String(stats.completed_topics)} accent />
            <Stat label="Average" value={stats.average_score ? String(stats.average_score) : "—"} />
            <Stat label="Time spoken" value={formatDuration(stats.speaking_time_seconds)} />
            <Stat label="Streak" value={`${stats.current_streak_days}d`} />
            <Stat label="Best" value={stats.best_score ? String(stats.best_score) : "—"} />
          </StatGrid>
        ) : (
          !failed && <LoadingState label="Loading your stats" />
        )}
      </section>

      {/* -------------------------------------------------- recent activity */}
      <section aria-label="Recent activity" className="mt-14 sm:mt-16">
        <SectionHead
          label="Recent activity"
          action={
            history && history.length > 0 ? (
              <Link
                to="/history"
                className="-mb-2.5 inline-flex min-h-11 items-end gap-2 pb-2.5 font-mono text-xs font-semibold uppercase tracking-[0.12em] text-muted hover:text-fg"
              >
                All <Arrow />
              </Link>
            ) : undefined
          }
        />
        {history === null ? (
          !failed && <LoadingState label="Loading history" />
        ) : history.length === 0 ? (
          <div className="py-8">
            <p className="display text-3xl">No practice sessions yet</p>
            <p className="mt-3 prose-body text-muted">Your communication journey starts here.</p>
          </div>
        ) : (
          <>
            <RecentActivity entries={history.slice(0, 5)} />
            <Link to="/history" className={`${buttonClass("outline")} mt-7`}>
              View history <Arrow />
            </Link>
          </>
        )}
      </section>

      {/* -------------------------------------------------- progress preview */}
      <section aria-label="Progress" className="mt-14 sm:mt-16">
        <SectionHead label="Progress" title="last 10 scored sessions" />
        {history === null ? null : scored.length < 2 ? (
          <div className="py-8">
            <p className="display text-3xl">Not enough data yet</p>
            <p className="mt-3 prose-body text-muted">Complete a few challenges to see your progress.</p>
          </div>
        ) : (
          <div className="grid gap-10 pt-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-12">
            <div className="min-w-0">
              <LineChart
                title="Overall score"
                max={100}
                labelHead="Session"
                valueHead="Score"
                points={scored.map((e) => ({
                  label: formatDay(dayKey(e.created_at)),
                  value: e.overall_score,
                  detail: `${e.overall_score} · ${outcomeOf(e.status).label}`,
                }))}
              />
            </div>
            {/* Only what the backend's own trend figures back up. */}
            <div className="min-w-0 lg:border-l lg:border-line lg:pl-10">
              <Eyebrow>Lately</Eyebrow>
              {insights.length > 0 ? (
                <ul className="mt-4 space-y-4">
                  {insights.slice(0, 2).map((line) => (
                    <li key={line} className="headline text-xl font-semibold">
                      {line}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 prose-body text-muted">
                  Nothing stands out yet. Trends appear once there are enough sessions to compare.
                </p>
              )}
              <Link to="/progress" className={`${buttonClass("outline")} mt-8`}>
                View progress <Arrow />
              </Link>
            </div>
          </div>
        )}
      </section>

      <QuoteBlock seed={stats?.total_attempts ?? 0} className="mt-16" />
    </Layout>
  );
}
