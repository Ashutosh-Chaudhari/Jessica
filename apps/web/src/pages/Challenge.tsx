import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import type { ActiveChallenge, SubmitChallengeResponse } from "@jessica/types";
import type { DurationOption } from "@jessica/types";
import { DURATION_OPTIONS, MAX_RECORDING_SECONDS } from "@jessica/types";
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
  // getUserMedia blocks on the browser's permission prompt, which is not modal:
  // without this the length could still be changed while start() is in flight,
  // and the recorder would auto-stop on the length it captured rather than the
  // one the clock and the submit were then reporting.
  const [starting, setStarting] = useState(false);
  // The longest option stays the default; the speaker can shorten it before
  // starting. Holding the whole option, not just the seconds, keeps its label
  // and its pass rules from drifting apart.
  const [choice, setChoice] = useState<DurationOption>(
    () => DURATION_OPTIONS.find((o) => o.seconds === MAX_RECORDING_SECONDS)!,
  );
  const recorder = useRecorder(choice.seconds);
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
    if (!challenge || starting) return;
    setStarting(true);
    const ready = await recorder.start();
    setStarting(false);
    if (ready) setPhase("recording"); // otherwise the error slab explains why
  }, [challenge, recorder, starting]);

  const send = useCallback(async () => {
    const recorded = recordedRef.current;
    if (!challenge || !recorded) return;
    setSubmitError(null);
    setPhase("processing");
    try {
      setResult(
        await api.challenges.submit(
          challenge.id,
          recorded.audio,
          recorded.durationSeconds,
          choice.seconds,
        ),
      );
    } catch (e: unknown) {
      // The recording is still in hand, so offer to send it again rather than
      // dropping the user back onto a microphone that is already switched off.
      setSubmitError(e instanceof Error ? e.message : "Submission failed.");
      setPhase("submitFailed");
    }
  }, [challenge, choice.seconds]);

  const finishSpeaking = useCallback(async () => {
    if (!challenge) return;
    // recorder.elapsedSeconds, not wall clock: after the auto-stop at the
    // chosen limit the clock keeps running but the recording does not.
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

  const remaining = choice.seconds - recorder.elapsedSeconds;
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
                <Clock seconds={live ? Math.max(0, remaining) : choice.seconds} live={recorder.recording} />
              </div>
            </div>
          </div>

          {live && !recorder.recording && (
            <p className="mt-6 font-mono text-sm font-bold uppercase tracking-[0.1em] text-amber-text">
              Time is up — send it
            </p>
          )}

          {phase === "preparing" && (
            <fieldset className="mt-8">
              <legend className="font-mono text-sm font-bold uppercase tracking-[0.1em] text-muted">
                How long do you want?
              </legend>
              <div className="mt-3 flex flex-wrap gap-3">
                {DURATION_OPTIONS.filter((o) => o.seconds <= challenge.max_duration_seconds).map(
                  (option) => (
                    <button
                      key={option.seconds}
                      type="button"
                      aria-pressed={choice.seconds === option.seconds}
                      disabled={starting}
                      onClick={() => setChoice(option)}
                      className={`border-2 rule px-5 py-2 font-mono text-sm font-bold uppercase tracking-[0.1em] disabled:cursor-not-allowed disabled:opacity-40 ${
                        choice.seconds === option.seconds
                          ? "bg-fg text-bg hard-shadow"
                          : "bg-surface hover:text-signal-text"
                      }`}
                    >
                      {option.label}
                    </button>
                  ),
                )}
              </div>
            </fieldset>
          )}

          <div className="mt-10 flex flex-wrap items-center gap-4 border-t-2 rule pt-8">
            {phase === "preparing" ? (
              <>
                <Button
                  onClick={() => void startSpeaking()}
                  disabled={starting}
                  className="px-8 py-4 text-base"
                >
                  {starting ? "Waiting for the microphone" : "Start speaking"}
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
                Speak for at least {choice.rules.min_duration_seconds} seconds and up to{" "}
                {choice.label}. The clock stops itself at the limit.
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
