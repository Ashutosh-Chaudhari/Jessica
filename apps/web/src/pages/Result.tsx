import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import type { HistoryEntry, SubmitChallengeResponse } from "@jessica/types";
import { api } from "../services";
import { Layout } from "../components/Layout";
import {
  Arrow,
  Button,
  Eyebrow,
  LoadingState,
  Meter,
  Notice,
  QuoteBlock,
  SectionHead,
  StatePanel,
  buttonClass,
} from "../components/primitives";
import {
  FeedbackColumns,
  RetryComparison,
  StructureGuide,
  TranscriptPanel,
  type ComparedScore,
} from "../components/report";
import { formatDate } from "../hooks/format";
import { previousAttempt } from "../hooks/sessions";

export default function Result() {
  const { attemptId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [data, setData] = useState<SubmitChallengeResponse | null>(
    (location.state as SubmitChallengeResponse | null) ?? null,
  );
  const [showTranscript, setShowTranscript] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Result - Jessica";
    // Refresh-safe: fall back to stored history if navigation state is gone.
    if (!data && attemptId) {
      void api.progress.getHistory().then((entries) => {
        const match = entries.find((e) => e.id === attemptId);
        if (match) {
          setData({
            attempt: match,
            evaluation: {
              overall: match.overall_score ?? 0,
              fluency: match.fluency_score ?? 0,
              coherence: match.coherence_score ?? 0,
              vocabulary: match.vocabulary_score ?? 0,
              relevance: match.relevance_score ?? 0,
              structure: match.structure_score ?? 0,
              filler_count: match.filler_count ?? 0,
              feedback: match.feedback,
              passed: match.status === "passed",
              fail_reason: null,
            },
          });
        }
      });
    }
  }, [attemptId, data]);

  // Read-only: the same history the refresh fallback uses, kept to find an
  // earlier attempt at this topic. No earlier attempt, no comparison.
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);
  const [historyFailed, setHistoryFailed] = useState(false);
  useEffect(() => {
    void api.progress
      .getHistory()
      .then(setHistory)
      .catch(() => setHistoryFailed(true));
  }, []);

  if (!data) {
    // "Not found" only once the list has actually arrived without it - a
    // request that failed says nothing about whether the report exists.
    const missing = history !== null && !history.some((e) => e.id === attemptId);
    return (
      <Layout>
        {historyFailed ? (
          <StatePanel
            tone="error"
            label="Not loaded"
            title="Report not loaded"
            actions={
              <Link to="/dashboard" className={buttonClass("outline")}>
                Back to dashboard
              </Link>
            }
          >
            <p>Your history could not be reached just now, so this report cannot be shown. Try again in a moment.</p>
          </StatePanel>
        ) : missing ? (
          <StatePanel
            label="Not found"
            title="No such result"
            actions={
              <Link to="/dashboard" className={buttonClass("outline")}>
                Back to dashboard
              </Link>
            }
          >
            <p>This report is not in your history.</p>
          </StatePanel>
        ) : (
          <LoadingState label="Loading your report" />
        )}
      </Layout>
    );
  }

  const { attempt, evaluation } = data;
  const previous = history ? previousAttempt(history, attempt) : null;

  async function handleRetry() {
    setBusy(true);
    setActionError(null);
    try {
      await api.challenges.retry(attempt.challenge_id);
      navigate("/challenge");
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : "Could not start the retry.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSkip() {
    setBusy(true);
    setActionError(null);
    try {
      await api.challenges.skip(attempt.challenge_id);
      navigate("/dashboard");
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : "Could not skip this topic.");
    } finally {
      setBusy(false);
    }
  }

  /** Shown twice - under the score and at the end - so the next move is never a scroll away. */
  const actions = (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
      {evaluation.passed ? (
        <Link to="/challenge" className={`${buttonClass("primary", "lg")} max-sm:w-full`}>
          Next challenge <Arrow />
        </Link>
      ) : (
        <>
          <Button
            variant="retry"
            size="lg"
            onClick={() => void handleRetry()}
            busy={busy}
            className="max-sm:w-full"
          >
            Retry challenge <Arrow />
          </Button>
          <Button variant="ghost" onClick={() => void handleSkip()} disabled={busy}>
            Give me a different one
          </Button>
        </>
      )}
      <Link to="/dashboard" className={buttonClass("ghost")}>
        Dashboard
      </Link>
    </div>
  );

  const scores: ComparedScore[] = [
    { label: "Overall", now: evaluation.overall, before: previous?.overall_score ?? null },
    { label: "Fluency", now: evaluation.fluency, before: previous?.fluency_score ?? null },
    { label: "Coherence", now: evaluation.coherence, before: previous?.coherence_score ?? null },
    { label: "Vocabulary", now: evaluation.vocabulary, before: previous?.vocabulary_score ?? null },
    { label: "Relevance", now: evaluation.relevance, before: previous?.relevance_score ?? null },
    { label: "Structure", now: evaluation.structure, before: previous?.structure_score ?? null },
  ];

  // A provider outage stores the attempt with no scores at all. Showing zeros
  // for it would be inventing a result, so the report says so instead.
  const unscored = attempt.status === "processing_error";

  return (
    <Layout>
      <header>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <Eyebrow>Your communication report</Eyebrow>
          <span className="font-mono text-xs uppercase tracking-[0.12em] text-muted">
            {formatDate(attempt.created_at)} · {attempt.duration_seconds}s spoken
          </span>
        </div>
        <h1 className="headline mt-5 max-w-[30ch] text-[clamp(1.5rem,3vw,2.25rem)]">{attempt.topic_text}</h1>
      </header>

      {unscored ? (
        <div className="mt-10 border-t-2 border-rule pt-10">
          <StatePanel tone="error" label="Not scored" title="Analysis unavailable" actions={actions}>
            <p>
              Jessica could not finish analysing this answer, so there are no scores for it. It
              does not count toward your scores or streak.
            </p>
          </StatePanel>
          {actionError && (
            <div className="mt-6">
              <Notice>{actionError}</Notice>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* The score, at the scale it deserves - the one moment on this page that moves. */}
          <section
            aria-label="Overall result"
            className="mt-8 grid gap-10 border-y-2 border-rule py-10 md:grid-cols-[auto_minmax(0,1fr)] md:items-end md:gap-14"
          >
            <div>
              <Eyebrow>Overall</Eyebrow>
              <p className="mt-4 flex items-start gap-3">
                <span
                  className={`score-in numeral text-[clamp(7rem,19vw,12rem)] ${
                    evaluation.passed ? "text-signal-ink" : "text-amber-text"
                  }`}
                >
                  {evaluation.overall}
                </span>
                <span className="mt-2 font-mono text-xl font-semibold text-faint sm:text-2xl">/ 100</span>
              </p>
            </div>

            <div className="min-w-0">
              <p
                className={`display text-[clamp(2rem,4.2vw,3.25rem)] ${
                  evaluation.passed ? "text-signal-text" : "text-amber-text"
                }`}
              >
                {evaluation.passed ? "Topic completed" : "Not this time"}
              </p>
              {evaluation.fail_reason && (
                <p className="mt-3 max-w-md prose-body text-muted">{evaluation.fail_reason}</p>
              )}
              <dl className="mt-6 grid grid-cols-2 border-y border-line">
                <div className="py-3 pr-4">
                  <dt className="eyebrow">Spoken</dt>
                  <dd className="readout mt-1 text-lg">{attempt.duration_seconds}s</dd>
                </div>
                <div className="border-l border-line py-3 pl-4">
                  <dt className="eyebrow">Filler words</dt>
                  <dd className="readout mt-1 text-lg">{evaluation.filler_count}</dd>
                </div>
              </dl>
              <div className="mt-8">{actions}</div>
              {actionError && (
                <div className="mt-6">
                  <Notice>{actionError}</Notice>
                </div>
              )}
            </div>
          </section>

          {/* Improve next leads: it is the part of a report you act on. */}
          {evaluation.feedback.length > 0 && (
            <div className="mt-14">
              <FeedbackColumns feedback={evaluation.feedback} />
            </div>
          )}

          <section aria-labelledby="dimensions" className="mt-16">
            <SectionHead id="dimensions" label="How it came across" title="each scored 0-100" />
            <div className="mt-6 max-w-3xl space-y-5">
              <Meter label="Fluency" score={evaluation.fluency} />
              <Meter label="Coherence" score={evaluation.coherence} />
              <Meter label="Vocabulary" score={evaluation.vocabulary} />
              <Meter label="Relevance" score={evaluation.relevance} />
              <Meter label="Structure" score={evaluation.structure} />
            </div>
          </section>

          {previous && (
            <div className="mt-16">
              <RetryComparison
                scores={scores}
                previousDate={previous.created_at}
                currentDate={attempt.created_at}
              />
            </div>
          )}
        </>
      )}

      <div className="mt-16">
        <TranscriptPanel
          transcript={attempt.transcript}
          open={showTranscript}
          onToggle={() => setShowTranscript((v) => !v)}
        />
      </div>

      <div className="mt-16">
        <StructureGuide />
      </div>

      {!unscored && <div className="mt-14 border-t-2 border-rule pt-8">{actions}</div>}

      <QuoteBlock seed={evaluation.overall} className="mt-14" />
    </Layout>
  );
}
