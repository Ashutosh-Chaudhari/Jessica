import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import type { ActiveChallenge, SubmitChallengeResponse } from "@jessica/types";
import { DEFAULT_PASS_RULES, MAX_RECORDING_SECONDS } from "@jessica/types";
import { api } from "../services";
import { Layout } from "../components/Layout";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { PrivacyNote } from "../components/PrivacyNote";
import { formatClock } from "../hooks/format";
import { useRecorder } from "../hooks/useRecorder";

type Phase = "generating" | "loadFailed" | "preparing" | "recording" | "processing" | "submitFailed";

export default function Challenge() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>("generating");
  const [challenge, setChallenge] = useState<ActiveChallenge | null>(null);
  const [result, setResult] = useState<SubmitChallengeResponse | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const recorder = useRecorder(MAX_RECORDING_SECONDS);
  const recordedRef = useRef<{ audio: Blob; durationSeconds: number } | null>(null);

  const loadChallenge = useCallback(() => {
    setPhase("generating");
    setLoadError(null);
    return api.challenges
      .start()
      .then((res) => {
        setChallenge(res.challenge);
        setPhase("preparing");
        return true;
      })
      .catch((e: unknown) => {
        // Without this the page sits on "Generating your topic..." forever.
        setLoadError(e instanceof Error ? e.message : "Could not start a challenge.");
        setPhase("loadFailed");
        return false;
      });
  }, []);

  useEffect(() => {
    document.title = `Challenge - Jessica`;
    void loadChallenge();
  }, [loadChallenge]);

  // Auto-navigate once a submission completes.
  useEffect(() => {
    if (result) navigate(`/result/${result.attempt.id}`, { state: result });
  }, [result, navigate]);

  const startSpeaking = useCallback(async () => {
    if (!challenge) return;
    if (!(await recorder.start())) return; // the error card explains why
    setPhase("recording");
  }, [challenge, recorder]);

  const send = useCallback(async () => {
    const recorded = recordedRef.current;
    if (!challenge || !recorded) return;
    setSubmitError(null);
    setPhase("processing");
    try {
      setResult(await api.challenges.submit(challenge.id, recorded.audio, recorded.durationSeconds));
    } catch (e: unknown) {
      // The recording is still in hand, so offer to send it again rather than
      // dropping the user back onto a microphone that is already switched off.
      setSubmitError(e instanceof Error ? e.message : "Submission failed.");
      setPhase("submitFailed");
    }
  }, [challenge]);

  const finishSpeaking = useCallback(async () => {
    if (!challenge) return;
    // recorder.elapsedSeconds, not wall clock: after the auto-stop at two
    // minutes the clock keeps running but the recording does not.
    const durationSeconds = Math.max(1, recorder.elapsedSeconds);
    setPhase("processing");

    const audio = await recorder.stop();
    if (!audio || audio.size === 0) {
      setSubmitError("No audio was captured. Check your microphone and try again.");
      setPhase("preparing");
      return;
    }

    recordedRef.current = { audio, durationSeconds };
    void send();
  }, [challenge, recorder, send]);

  const rerecord = useCallback(() => {
    recordedRef.current = null;
    setSubmitError(null);
    recorder.reset();
    setPhase("preparing");
  }, [recorder]);

  return (
    <Layout>
      <p className="mb-8 text-center font-mono text-xs uppercase tracking-[0.35em] text-zinc-500">
        Your Challenge
      </p>

      {phase === "generating" && (
        <Card className="mx-auto max-w-2xl p-12 text-center">
          <p className="font-mono text-sm text-zinc-500">Generating your topic…</p>
        </Card>
      )}

      {phase === "loadFailed" && (
        <Card className="mx-auto max-w-2xl border-red-900/50 p-10 text-center">
          <p className="text-sm text-red-300">{loadError}</p>
          <div className="mt-6 flex flex-col items-center gap-3">
            <Button onClick={() => void loadChallenge()}>Try again</Button>
            <button
              onClick={() => navigate("/dashboard")}
              className="cursor-pointer text-xs text-zinc-600 hover:text-zinc-400"
            >
              Back to dashboard
            </button>
          </div>
        </Card>
      )}

      {(phase === "preparing" || phase === "recording") && challenge && (
        <Card className="mx-auto max-w-2xl p-10">
          <h1 className="text-center text-2xl font-medium leading-snug text-zinc-50">
            {challenge.topic_text}
          </h1>

          <div className="mt-10 text-center">
            <span className="font-mono text-5xl tabular-nums text-emerald-300">
              {formatClock(
                phase === "recording" ? recorder.elapsedSeconds : MAX_RECORDING_SECONDS,
              )}
            </span>
            {phase === "recording" && (
              // Driven by the recorder, not the phase: at two minutes it stops
              // itself and the indicator has to stop lying about it.
              <p
                className={`mt-3 flex items-center justify-center gap-2 font-mono text-xs uppercase tracking-widest ${
                  recorder.recording ? "text-red-400" : "text-zinc-500"
                }`}
              >
                <span
                  className={`inline-block h-2 w-2 rounded-full ${
                    recorder.recording ? "animate-pulse bg-red-500" : "bg-zinc-600"
                  }`}
                />
                {recorder.recording ? "Recording" : "Time is up"}
              </p>
            )}
          </div>

          <div className="mt-10 flex flex-col items-center gap-4">
            {phase === "preparing" ? (
              <>
                <Button onClick={() => void startSpeaking()} className="px-10 py-3 tracking-wide">
                  START SPEAKING
                </Button>
                <p className="max-w-sm text-center text-xs leading-relaxed text-zinc-600">
                  Speak for at least {DEFAULT_PASS_RULES.min_duration_seconds} seconds and up to{" "}
                  {MAX_RECORDING_SECONDS / 60} minutes.
                </p>
                <PrivacyNote className="max-w-sm" />
              </>
            ) : (
              <Button
                variant="secondary"
                onClick={() => void finishSpeaking()}
                className="px-10 py-3 tracking-wide"
              >
                FINISH
              </Button>
            )}
            {phase === "preparing" && (
              <button
                onClick={() => navigate("/dashboard")}
                className="cursor-pointer text-xs text-zinc-600 hover:text-zinc-400"
              >
                Back to dashboard
              </button>
            )}
          </div>
        </Card>
      )}

      {phase === "processing" && (
        <Card className="mx-auto max-w-2xl p-12 text-center">
          <p className="font-mono text-sm text-zinc-400">Jessica is listening…</p>
          <p className="mt-2 text-xs text-zinc-600">
            Transcribing and evaluating your response.
          </p>
        </Card>
      )}

      {phase === "submitFailed" && (
        <Card className="mx-auto max-w-2xl border-red-900/50 p-10 text-center">
          <p className="text-sm text-red-300">{submitError}</p>
          <p className="mt-2 text-xs text-zinc-600">Your recording is still here.</p>
          <div className="mt-6 flex flex-col items-center gap-3">
            <Button onClick={() => void send()}>Send it again</Button>
            <button
              onClick={rerecord}
              className="cursor-pointer text-xs text-zinc-600 hover:text-zinc-400"
            >
              Record a new answer instead
            </button>
          </div>
        </Card>
      )}

      {recorder.error && phase !== "processing" && (
        <Card className="mx-auto mt-6 max-w-2xl border-red-900/50 p-5 text-center">
          <p className="text-sm text-red-300">
            {recorder.error === "denied"
              ? "Microphone access was denied. Allow mic access in your browser to record."
              : "Audio recording is not available in this browser."}
          </p>
          <Button variant="secondary" className="mt-4" onClick={() => void startSpeaking()}>
            Try again
          </Button>
        </Card>
      )}

      {submitError && phase === "preparing" && (
        <Card className="mx-auto mt-6 max-w-2xl border-red-900/50 p-5 text-center">
          <p className="text-sm text-red-300">{submitError}</p>
        </Card>
      )}
    </Layout>
  );
}
