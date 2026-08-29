import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import type { SubmitChallengeResponse } from "@jessica/types";
import { api } from "../services";
import { Layout } from "../components/Layout";
import { Button, Eyebrow, Meter, Notice, QuoteBlock, Slab } from "../components/primitives";

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

  if (!data) {
    return (
      <Layout>
        <Slab className="p-12">
          <Eyebrow>Not found</Eyebrow>
          <p className="display mt-4 text-3xl">No such result</p>
          <Link to="/dashboard" className="mt-8 inline-block">
            <Button variant="outline">Back to dashboard</Button>
          </Link>
        </Slab>
      </Layout>
    );
  }

  const { attempt, evaluation } = data;

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

  return (
    <Layout>
      <div className="border-b-2 rule pb-6">
        <Eyebrow>You said</Eyebrow>
        <h1 className="mt-3 font-display text-xl font-bold leading-tight tracking-tight sm:text-2xl">
          {attempt.topic_text}
        </h1>
      </div>

      {/* The score, at the scale it deserves. */}
      <div className="mt-8 grid gap-6 sm:grid-cols-[auto_1fr] sm:items-end">
        <div className="border-2 rule bg-surface px-8 py-5 hard-shadow">
          <span className="display tabular block text-8xl sm:text-9xl">{evaluation.overall}</span>
        </div>
        <div className="pb-2">
          <p
            className={`display text-3xl sm:text-4xl ${evaluation.passed ? "text-signal-text" : "text-amber-text"}`}
          >
            {evaluation.passed ? "Topic completed" : "Not this time"}
          </p>
          {evaluation.fail_reason && (
            <p className="mt-3 max-w-md prose-body text-muted">
              {evaluation.fail_reason}
            </p>
          )}
          <p className="mt-3 font-mono text-sm uppercase tracking-[0.1em] text-muted">
            {attempt.duration_seconds}s spoken · {evaluation.filler_count} filler words
          </p>
        </div>
      </div>

      <section className="mt-10 border-t-2 rule pt-8">
        <Eyebrow>How it came across</Eyebrow>
        <div className="mt-5 space-y-3">
          <Meter label="Fluency" score={evaluation.fluency} />
          <Meter label="Coherence" score={evaluation.coherence} />
          <Meter label="Vocabulary" score={evaluation.vocabulary} />
          <Meter label="Relevance" score={evaluation.relevance} />
          <Meter label="Structure" score={evaluation.structure} />
        </div>
      </section>

      {evaluation.feedback.length > 0 && (
        <section className="mt-10 border-t-2 rule pt-8">
          <Eyebrow>Notes</Eyebrow>
          <ul className="mt-4 space-y-3">
            {evaluation.feedback.map((f) => (
              <li key={f} className="border-l-4 border-signal pl-4 prose-body">
                {f}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-10 border-t-2 rule pt-6">
        <button
          onClick={() => setShowTranscript((v) => !v)}
          className="cursor-pointer font-mono text-sm font-bold uppercase tracking-[0.1em] underline decoration-2 underline-offset-4 hover:text-signal-text"
        >
          {showTranscript ? "Hide what you said" : "Read what you said"}
        </button>
        {showTranscript && (
          <Slab className="mt-4 p-6">
            <p className="prose-body">{attempt.transcript}</p>
          </Slab>
        )}
      </section>

      <div className="mt-10 flex flex-wrap items-center gap-4 border-t-2 rule pt-8">
        {evaluation.passed ? (
          <Link to="/challenge">
            <Button className="px-8 py-4 text-base">Next challenge</Button>
          </Link>
        ) : (
          <>
            <Button onClick={() => void handleRetry()} disabled={busy} className="px-8 py-4 text-base">
              {busy ? "Working…" : "Try this topic again"}
            </Button>
            <Button variant="ghost" onClick={() => void handleSkip()} disabled={busy}>
              Give me a different one
            </Button>
          </>
        )}
        <Link
          to="/dashboard"
          className="font-mono text-sm uppercase tracking-[0.1em] text-muted underline decoration-2 underline-offset-4 hover:text-fg"
        >
          Dashboard
        </Link>
      </div>

      {actionError && (
        <div className="mt-6">
          <Notice>{actionError}</Notice>
        </div>
      )}

      <QuoteBlock seed={evaluation.overall} className="mt-12" />
    </Layout>
  );
}
