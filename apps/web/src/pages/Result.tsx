import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import type { SubmitChallengeResponse } from "@jessica/types";
import { api } from "../services";
import { Layout } from "../components/Layout";
import { Button } from "../components/Button";
import { Card, ScoreBar } from "../components/Card";

export default function Result() {
  const { attemptId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [data, setData] = useState<SubmitChallengeResponse | null>(
    (location.state as SubmitChallengeResponse | null) ?? null,
  );
  const [showTranscript, setShowTranscript] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    document.title = `Result - Jessica`;
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
        <Card className="mx-auto max-w-2xl p-12 text-center">
          <p className="text-sm text-zinc-500">Result not found.</p>
          <Link to="/dashboard" className="mt-4 inline-block">
            <Button variant="secondary">Back to dashboard</Button>
          </Link>
        </Card>
      </Layout>
    );
  }

  const { attempt, evaluation } = data;

  async function handleRetry() {
    setRetrying(true);
    setActionError(null);
    try {
      await api.challenges.retry(attempt.challenge_id);
      navigate("/challenge");
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : "Could not start the retry.");
    } finally {
      setRetrying(false);
    }
  }

  async function handleSkip() {
    setRetrying(true);
    setActionError(null);
    try {
      await api.challenges.skip(attempt.challenge_id);
      navigate("/dashboard");
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : "Could not skip this topic.");
    } finally {
      setRetrying(false);
    }
  }

  return (
    <Layout>
      <div className="mx-auto max-w-2xl">
        <p className="mb-8 text-center font-mono text-xs uppercase tracking-[0.35em] text-zinc-500">
          Your Result
        </p>

        <Card className="p-10">
          <div className="text-center">
            <span className="font-mono text-7xl font-bold tabular-nums text-emerald-300">
              {evaluation.overall}
            </span>
            <p className="mt-3 text-sm font-medium tracking-wide">
              {evaluation.passed ? (
                <span className="text-emerald-300">PASSED - topic completed</span>
              ) : (
                <span className="text-amber-400">NOT PASSED - you can retry</span>
              )}
            </p>
            {evaluation.fail_reason && (
              <p className="mx-auto mt-3 max-w-sm text-sm text-zinc-400">
                {evaluation.fail_reason}
              </p>
            )}
          </div>

          <div className="mt-10 space-y-4">
            <ScoreBar label="Fluency" score={evaluation.fluency} />
            <ScoreBar label="Coherence" score={evaluation.coherence} />
            <ScoreBar label="Vocabulary" score={evaluation.vocabulary} />
            <ScoreBar label="Relevance" score={evaluation.relevance} />
            <ScoreBar label="Structure" score={evaluation.structure} />
          </div>

          <div className="mt-10 grid gap-6 sm:grid-cols-2">
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-emerald-300">
                Good
              </h3>
              <ul className="space-y-1.5 text-sm text-zinc-400">
                {evaluation.feedback.slice(0, Math.ceil(evaluation.feedback.length / 2)).map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-amber-400">
                Improve
              </h3>
              <ul className="space-y-1.5 text-sm text-zinc-400">
                {evaluation.feedback.slice(Math.ceil(evaluation.feedback.length / 2)).map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-8 flex items-center justify-between border-t border-zinc-800 pt-5 text-xs text-zinc-600">
            <span>Duration {attempt.duration_seconds}s</span>
            <span>{evaluation.filler_count} filler words detected</span>
          </div>
        </Card>

        <div className="mt-4">
          <button
            onClick={() => setShowTranscript((v) => !v)}
            className="cursor-pointer text-sm text-zinc-400 hover:text-zinc-200"
          >
            {showTranscript ? "Hide transcript" : "View transcript"}
          </button>
          {showTranscript && (
            <Card className="mt-3 p-5">
              <p className="text-sm leading-relaxed text-zinc-300">{attempt.transcript}</p>
            </Card>
          )}
        </div>

        <div className="mt-8 flex flex-col items-center gap-3">
          {evaluation.passed ? (
            <Link to="/challenge">
              <Button className="px-8 py-3 tracking-wide">NEXT CHALLENGE</Button>
            </Link>
          ) : (
            <>
              <Button onClick={() => void handleRetry()} disabled={retrying} className="px-8 py-3 tracking-wide">
                {retrying ? "Preparing…" : "RETRY THIS TOPIC"}
              </Button>
              <button
                onClick={() => void handleSkip()}
                disabled={retrying}
                className="cursor-pointer text-xs text-zinc-600 hover:text-zinc-400 disabled:cursor-not-allowed"
              >
                Skip this topic instead
              </button>
            </>
          )}
          {actionError && <p className="text-sm text-red-300">{actionError}</p>}
          <Link to="/dashboard" className="text-xs text-zinc-600 hover:text-zinc-400">
            Back to dashboard
          </Link>
        </div>
      </div>
    </Layout>
  );
}
