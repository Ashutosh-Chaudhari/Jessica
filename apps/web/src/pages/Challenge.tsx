import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import type { ActiveChallenge, ChallengeCategory, SubmitChallengeResponse } from "@jessica/types";
import type { DurationOption } from "@jessica/types";
import { CATEGORY_LABELS, DURATION_OPTIONS, MAX_RECORDING_SECONDS } from "@jessica/types";
import { api } from "../services";
import { Layout } from "../components/Layout";
import { Arrow, Button, Eyebrow, Notice, QuoteBlock, StatePanel } from "../components/primitives";
import { LiveLamp } from "../components/Clock";
import {
  ActivityBars,
  ElapsedTrack,
  FinishButton,
  MetaLine,
  MicButton,
  ProcessingChecklist,
  Question,
  RecordingTimer,
} from "../components/practice";
import { useRecorder } from "../hooks/useRecorder";
import { formatClock } from "../hooks/format";

type Phase = "generating" | "loadFailed" | "preparing" | "recording" | "processing" | "submitFailed";

/** "random" is Jessica's own pick - the original experience, and the default. */
type Subject = ChallengeCategory | "random";

const SUBJECTS: { value: Subject; label: string }[] = [
  { value: "random", label: "Surprise me" },
  ...(Object.keys(CATEGORY_LABELS) as ChallengeCategory[]).map((value) => ({
    value,
    label: CATEGORY_LABELS[value],
  })),
];

const CHIP =
  "h-11 cursor-pointer border px-3.5 font-mono text-xs font-semibold uppercase tracking-[0.1em] transition-colors disabled:cursor-not-allowed disabled:opacity-40";

/**
 * Every way the microphone can refuse, each with what to do about it. The
 * recorder reports any failure to open the microphone as "denied" - refused,
 * missing or busy look the same to it - so that text covers all three.
 */
const MIC_ERRORS: Record<"denied" | "unsupported" | "unknown", { title: string; body: string[] }> = {
  denied: {
    title: "Microphone access required",
    body: [
      "Microphone access is required to record your communication practice. Nothing is recorded until you press Start speaking.",
      "If you blocked it, allow it from the icon in your browser's address bar. If it is allowed, check that a microphone is connected and not in use by another app.",
    ],
  },
  unsupported: {
    title: "This browser cannot record",
    body: ["Audio recording is not available here. Try a current version of Chrome, Edge, Firefox or Safari."],
  },
  unknown: {
    title: "Recording could not start",
    body: ["The microphone opened but the recording did not start. Try again, or try a current version of Chrome, Edge, Firefox or Safari."],
  },
};

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
  // Which subject the next topic should come from. Purely a preference for
  // what gets assigned next - it is not sent again once a topic is on screen.
  const [subject, setSubject] = useState<Subject>("random");
  const recorder = useRecorder(choice.seconds);
  const recordedRef = useRef<{ audio: Blob; durationSeconds: number } | null>(null);

  /**
   * Put a topic on screen. `abandonId` turns it into a skip: the shown topic is
   * recorded as skipped first, which is what frees the slot for a new one and
   * what guarantees the replacement is a different topic - the backend can
   * never re-assign a challenge this user has already been given.
   *
   * Both halves are one phase change, so skipping is one click and one loading
   * state, with no reload and no confirmation.
   */
  const loadChallenge = useCallback(async (want: Subject, abandonId?: string) => {
    setPhase("generating");
    setLoadError(null);
    try {
      if (abandonId) await api.challenges.skip(abandonId);
      const res = await api.challenges.start(want === "random" ? undefined : want);
      setChallenge(res.challenge);
      setPhase("preparing");
    } catch (e: unknown) {
      // Without this the page sits on "finding you a topic" forever.
      setLoadError(e instanceof Error ? e.message : "Could not start a challenge.");
      setPhase("loadFailed");
    }
  }, []);

  useEffect(() => {
    document.title = "Challenge - Jessica";
    void loadChallenge("random");
  }, [loadChallenge]);

  useEffect(() => {
    if (result) navigate(`/result/${result.attempt.id}`, { state: result });
  }, [result, navigate]);

  /** Not interested - take this one away and bring another. No penalty, no prompt. */
  const skipTopic = useCallback(() => {
    if (challenge) void loadChallenge(subject, challenge.id);
  }, [challenge, loadChallenge, subject]);

  /** Picking a subject is also a rejection of what is on screen, so it skips too. */
  const chooseSubject = useCallback(
    (want: Subject) => {
      if (want === subject) return;
      setSubject(want);
      void loadChallenge(want, challenge?.id);
    },
    [challenge, loadChallenge, subject],
  );

  const startSpeaking = useCallback(async () => {
    if (!challenge || starting) return;
    setStarting(true);
    const ready = await recorder.start();
    setStarting(false);
    if (!ready) return; // the error slab explains why

    // Fire-and-forget, and only once the recorder is actually running. A
    // refused microphone is not a started topic - recording it as one would
    // put "they opened it and gave up" into the personalisation data when the
    // speaker never got the chance. Not awaited either way: this must not sit
    // between the permission prompt and the clock, nor fail the attempt.
    void api.challenges.markStarted(challenge.id).catch(() => {});
    setPhase("recording");
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

  // Display only: "Challenge 11" is the next topic you would complete. If the
  // count cannot be read the heading simply goes without a number.
  const [completed, setCompleted] = useState<number | null>(null);
  useEffect(() => {
    void api.progress
      .getStats()
      .then((s) => setCompleted(s.completed_topics))
      .catch(() => {});
  }, []);

  const live = phase === "recording";
  const number = completed === null ? "" : ` ${String(completed + 1).padStart(2, "0")}`;

  return (
    <Layout focus={live || phase === "processing"}>
      {phase === "generating" && (
        <section role="status" className="py-4">
          <Eyebrow>Finding you a topic</Eyebrow>
          <p className="display mt-5 text-[clamp(3rem,9vw,6.75rem)]">Stand by</p>
          <p className="mt-5 max-w-md prose-body text-muted">
            Checking for something you have not been given before.
          </p>
          <div className="scan mt-10 max-w-md" />
        </section>
      )}

      {phase === "loadFailed" && (
        <StatePanel
          tone="error"
          label="Could not start"
          title="No topic yet"
          actions={
            <>
              <Button onClick={() => void loadChallenge(subject)}>
                Try again <Arrow />
              </Button>
              <Button variant="ghost" onClick={() => navigate("/dashboard")}>
                Back to dashboard
              </Button>
            </>
          }
        >
          <p>{loadError}</p>
        </StatePanel>
      )}

      {phase === "preparing" && challenge && (
        <>
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="display text-[clamp(1.75rem,3.4vw,2.5rem)]">
                Challenge<span className="text-signal-ink">{number}</span>
              </p>
              <div className="mt-3">
                <MetaLine items={[CATEGORY_LABELS[challenge.category], `Up to ${formatClock(choice.seconds)}`]} />
              </div>
            </div>
            <LiveLamp live={recorder.recording} />
          </header>

          <div className="mt-8 border-t-2 border-rule pt-8 sm:mt-10 sm:pt-12 md:pl-[0.6em]">
            <Question>{challenge.topic_text}</Question>
          </div>

          <div className="mt-10 grid gap-10 border-t border-rule pt-8 sm:mt-14 lg:grid-cols-[minmax(0,1fr)_27rem] lg:gap-14 lg:pt-10">
            <div className="min-w-0">
              <Eyebrow>How to answer</Eyebrow>
              <p className="headline mt-4 text-2xl sm:text-3xl">Speak naturally.</p>
              <p className="mt-3 max-w-md text-lg leading-relaxed text-muted">
                Structure your response with a clear point, explanation and example, then close
                it off.
              </p>
              {/* The same shape the report suggests, and what "structure" is scored on. */}
              <ol className="mt-6 flex flex-wrap gap-2" aria-label="A simple shape for your answer">
                {["Point", "Explanation", "Example", "Close"].map((step, i) => (
                  <li
                    key={step}
                    className="inline-flex h-9 items-center gap-2.5 border border-line-strong px-3 font-mono text-xs font-semibold uppercase tracking-[0.12em]"
                  >
                    <span className="text-signal-text">{String(i + 1).padStart(2, "0")}</span>
                    {step}
                  </li>
                ))}
              </ol>

              <fieldset className="mt-12">
                <legend className="eyebrow text-fg">Rather talk about something else?</legend>
                <p className="mt-2 font-mono text-xs text-faint">Picking a subject swaps this topic for a new one.</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {SUBJECTS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={subject === option.value}
                      disabled={starting}
                      onClick={() => chooseSubject(option.value)}
                      className={`${CHIP} ${
                        subject === option.value
                          ? "border-fg bg-fg text-bg"
                          : "border-control text-muted hover:border-fg hover:text-fg"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </fieldset>
            </div>

            <section aria-labelledby="get-ready" className="min-w-0 self-start border border-line-strong bg-surface p-5 sm:p-8">
              <Eyebrow>Before recording</Eyebrow>
              <h2 id="get-ready" className="display mt-3 text-[2.5rem]">
                Get ready
              </h2>
              <p className="mt-3 prose-body text-muted">
                Find somewhere you can speak out loud. Your browser may ask for microphone access
                when you press Start speaking.
              </p>

              <fieldset className="mt-7">
                <legend className="eyebrow text-fg">How long do you want?</legend>
                <div className="mt-3 grid grid-flow-col border border-control">
                  {DURATION_OPTIONS.filter((o) => o.seconds <= challenge.max_duration_seconds).map(
                    (option, i) => (
                      <button
                        key={option.seconds}
                        type="button"
                        aria-pressed={choice.seconds === option.seconds}
                        disabled={starting}
                        onClick={() => setChoice(option)}
                        className={`h-12 cursor-pointer font-mono text-sm font-semibold uppercase tracking-[0.1em] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                          i > 0 ? "border-l border-control" : ""
                        } ${
                          choice.seconds === option.seconds
                            ? "bg-signal text-signal-fg"
                            : "text-muted hover:bg-raised hover:text-fg"
                        }`}
                      >
                        {option.label}
                      </button>
                    ),
                  )}
                </div>
              </fieldset>

              {submitError && (
                <div className="mt-6">
                  <Notice>{submitError}</Notice>
                </div>
              )}

              <div className="mt-7">
                <MicButton onClick={() => void startSpeaking()} starting={starting} />
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
                {/* Visible, one click, no confirmation: turning a topic down is
                    an ordinary move, not a failure. */}
                <Button variant="outline" onClick={skipTopic} disabled={starting}>
                  Skip topic <Arrow />
                </Button>
                <Button variant="ghost" onClick={() => navigate("/dashboard")}>
                  Not now
                </Button>
              </div>

              <p className="mt-6 border-t border-line pt-4 font-mono text-xs leading-relaxed text-muted">
                Speak for at least {choice.rules.min_duration_seconds} seconds and up to{" "}
                {choice.label}. The clock stops itself at the limit.
              </p>
            </section>
          </div>
        </>
      )}

      {live && challenge && (
        <section aria-label="Recording">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b-2 border-live pb-5">
            <LiveLamp live={recorder.recording} />
            <MetaLine
              items={[`Challenge${number}`, CATEGORY_LABELS[challenge.category], `Up to ${formatClock(choice.seconds)}`]}
            />
          </div>

          <div className="mt-8 md:pl-[0.6em]">
            <Question size="md">{challenge.topic_text}</Question>
          </div>

          <div className="mt-10 sm:mt-12">
            <RecordingTimer
              elapsed={recorder.elapsedSeconds}
              total={choice.seconds}
              live={recorder.recording}
            />
          </div>

          <div className="mt-8">
            <ActivityBars running={recorder.recording} />
          </div>

          <div className="mt-8">
            <ElapsedTrack
              elapsed={recorder.elapsedSeconds}
              total={choice.seconds}
              minimum={choice.rules.min_duration_seconds}
            />
          </div>

          {!recorder.recording && (
            <p role="alert" className="mt-6 font-mono text-sm font-bold uppercase tracking-[0.12em] text-amber-text">
              Time is up — send it
            </p>
          )}

          <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-4 border-t border-rule pt-8">
            <FinishButton onClick={() => void finishSpeaking()} timeUp={!recorder.recording} />
            <p className="max-w-xs font-mono text-xs leading-relaxed text-faint">
              Your transcript and scores appear in the report once you finish.
            </p>
          </div>
        </section>
      )}

      {phase === "processing" && (
        <section role="status" aria-label="Analysing your response" className="py-4">
          <Eyebrow>Analysing your response</Eyebrow>
          <p className="display mt-5 text-[clamp(3rem,9vw,6.75rem)]">Working it out</p>
          <p className="mt-5 max-w-md prose-body text-muted">
            Transcribing what you said, then scoring how it came across.
          </p>
          <div className="scan mt-10 max-w-xl" />
          <p className="eyebrow mt-14">What is being checked</p>
          <div className="mt-4">
            <ProcessingChecklist />
          </div>
        </section>
      )}

      {phase === "submitFailed" && (
        <StatePanel
          tone="error"
          label="Not sent"
          title="Your answer did not send"
          actions={
            <>
              <Button onClick={() => void send()}>
                Send it again <Arrow />
              </Button>
              <Button variant="ghost" onClick={rerecord}>
                Record a new answer
              </Button>
            </>
          }
        >
          <p>{submitError}</p>
          <p className="font-mono text-xs">Your recording is still here.</p>
        </StatePanel>
      )}

      {recorder.error && phase !== "processing" && (
        <StatePanel
          tone="error"
          className="mt-10"
          label="Microphone"
          title={MIC_ERRORS[recorder.error].title}
          actions={
            <Button onClick={() => void startSpeaking()}>
              Try again <Arrow />
            </Button>
          }
        >
          {MIC_ERRORS[recorder.error].body.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </StatePanel>
      )}

      {phase === "preparing" && (
        <p className="mt-12 max-w-2xl border-t border-line pt-6 prose-body text-muted">
          Your voice goes to a cloud speech service for transcription, and the transcript to an AI
          service for scoring. The audio is not kept.
        </p>
      )}

      {phase === "preparing" && <QuoteBlock seed={challenge?.topic_text.length ?? 1} className="mt-12" />}
    </Layout>
  );
}
