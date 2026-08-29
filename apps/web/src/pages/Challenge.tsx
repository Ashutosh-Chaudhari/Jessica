import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import type { ActiveChallenge, SubmitChallengeResponse } from "@jessica/types";
import { DEFAULT_PASS_RULES, MAX_RECORDING_SECONDS } from "@jessica/types";
import { api } from "../services";
import { Layout } from "../components/Layout";
import { Button, Eyebrow, Notice, QuoteBlock, Slab } from "../components/primitives";
import { Clock, LiveLamp } from "../components/Clock";
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
        // Without this the page sits on "finding you a topic" forever.
        setLoadError(e instanceof Error ? e.message : "Could not start a challenge.");
        setPhase("loadFailed");
        return false;
      });
  }, []);

  useEffect(() => {
    document.title = "Challenge - Jessica";
    void loadChallenge();
  }, [loadChallenge]);

  useEffect(() => {
    if (result) navigate(`/result/${result.attempt.id}`, { state: result });
  }, [result, navigate]);

  const startSpeaking = useCallback(async () => {
    if (!challenge) return;
    if (!(await recorder.start())) return; // the error slab explains why
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

  const remaining = MAX_RECORDING_SECONDS - recorder.elapsedSeconds;
  const live = phase === "recording";

  return (
    <Layout>
      {phase === "generating" && (
        <Slab className="p-12">
          <Eyebrow>Finding you a topic</Eyebrow>
          <p className="display mt-4 text-3xl">Stand by</p>
          <p className="mt-3 prose-body text-muted">
            Checking for something you have not been given before.
          </p>
        </Slab>
      )}

      {phase === "loadFailed" && (
        <Slab className="p-10">
          <Eyebrow>Could not start</Eyebrow>
          <p className="mt-4 font-sans text-base">{loadError}</p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Button onClick={() => void loadChallenge()}>Try again</Button>
            <Button variant="ghost" onClick={() => navigate("/dashboard")}>
              Back to dashboard
            </Button>
          </div>
        </Slab>
      )}

      {(phase === "preparing" || live) && challenge && (
        <>
          <div className="border-b-2 rule pb-6">
            <div className="flex items-center justify-between gap-4">
              <Eyebrow>Your topic</Eyebrow>
              <LiveLamp live={recorder.recording} />
            </div>
            <h1 className="mt-4 font-display text-2xl font-bold leading-tight tracking-tight sm:text-4xl">
              {challenge.topic_text}
            </h1>
          </div>

          <div className="scene mt-10">
            <div className="plane origin-left">
              <div className="inline-block border-2 rule bg-surface px-6 py-3 hard-shadow">
                <Clock seconds={live ? Math.max(0, remaining) : MAX_RECORDING_SECONDS} live={recorder.recording} />
              </div>
            </div>
          </div>

          {live && !recorder.recording && (
            <p className="mt-6 font-mono text-sm font-bold uppercase tracking-[0.1em] text-amber-text">
              Time is up — send it
            </p>
          )}

          <div className="mt-10 flex flex-wrap items-center gap-4 border-t-2 rule pt-8">
            {phase === "preparing" ? (
              <>
                <Button onClick={() => void startSpeaking()} className="px-8 py-4 text-base">
                  Start speaking
                </Button>
                <Button variant="ghost" onClick={() => navigate("/dashboard")}>
                  Not now
                </Button>
              </>
            ) : (
              <Button variant="outline" onClick={() => void finishSpeaking()} className="px-8 py-4 text-base">
                Finish
              </Button>
            )}
          </div>

          {phase === "preparing" && (
            <div className="mt-8 grid gap-6 border-t-2 rule pt-6 sm:grid-cols-2">
              <p className="prose-body text-muted">
                Speak for at least {DEFAULT_PASS_RULES.min_duration_seconds} seconds and up to{" "}
                {MAX_RECORDING_SECONDS / 60} minutes. The clock stops itself at the limit.
              </p>
              <p className="prose-body text-muted">
                Your voice goes to a cloud speech service for transcription, and the transcript
                to an AI service for scoring. The audio is not kept.
              </p>
            </div>
          )}
        </>
      )}

      {phase === "processing" && (
        <Slab className="p-12">
          <Eyebrow>Listening</Eyebrow>
          <p className="display mt-4 text-3xl">Working it out</p>
          <p className="mt-3 prose-body text-muted">
            Transcribing what you said, then scoring how it came across.
          </p>
        </Slab>
      )}

      {phase === "submitFailed" && (
        <Slab className="p-10">
          <Eyebrow>Not sent</Eyebrow>
          <p className="mt-4 font-sans text-base">{submitError}</p>
          <p className="mt-2 font-mono text-xs text-muted">Your recording is still here.</p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Button onClick={() => void send()}>Send it again</Button>
            <Button variant="ghost" onClick={rerecord}>
              Record a new answer
            </Button>
          </div>
        </Slab>
      )}

      {recorder.error && phase !== "processing" && (
        <div className="mt-6">
          <Notice>
            {recorder.error === "denied"
              ? "Microphone access was denied. Allow it in your browser, then try again."
              : "Audio recording is not available in this browser."}
          </Notice>
          <Button variant="outline" className="mt-4" onClick={() => void startSpeaking()}>
            Try again
          </Button>
        </div>
      )}

      {submitError && phase === "preparing" && (
        <div className="mt-6">
          <Notice>{submitError}</Notice>
        </div>
      )}

      {phase === "preparing" && <QuoteBlock seed={challenge?.topic_text.length ?? 1} className="mt-12" />}
    </Layout>
  );
}
