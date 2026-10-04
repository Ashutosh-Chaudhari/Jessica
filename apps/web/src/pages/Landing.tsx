import { Suspense, lazy } from "react";
import { Link } from "react-router";
import { MAX_RECORDING_SECONDS, DURATION_OPTIONS } from "@jessica/types";
import { Arrow, Eyebrow, QuoteBlock, buttonClass } from "../components/primitives";
import { Clock, useLoopingClock } from "../components/Clock";
import { ThemeCycle } from "../components/ThemeToggle";

// Three.js is ~150KB. Split it out so it never blocks the first paint of the
// headline, which is the thing people actually came to read.
const HeroScene = lazy(() => import("../components/HeroScene"));

const LENGTHS = DURATION_OPTIONS.map((o) => o.label).join(", ");

/**
 * The loop is numbered because it genuinely is one - you cannot be scored
 * before you speak, or speak before you are given something to speak about.
 * Every step names something the app does today.
 */
const LOOP = [
  { head: "Choose", body: "A topic you have not been given before - a surprise, or from a subject you pick." },
  { head: "Prepare", body: `See the question first, then set the clock: ${LENGTHS}.` },
  { head: "Speak", body: "Out loud, with nothing written down. The clock runs." },
  { head: "Analysis", body: "Your answer is transcribed, then scored on five dimensions." },
  { head: "Feedback", body: "What to improve next, and what already worked." },
  { head: "Retry", body: "If an answer does not pass, try the same topic again and compare." },
  { head: "Progress", body: "Weekly trends, streaks and your session history." },
];

/** Straight from what the scorer is asked to judge (packages/ai/src/prompts.ts). */
const DIMENSIONS = [
  { name: "Fluency", body: "Flow and continuity. Hesitation, restarts and filler lower it." },
  { name: "Coherence", body: "Whether your ideas connect and follow one another." },
  { name: "Vocabulary", body: "Range and precision of the words you choose." },
  { name: "Relevance", body: "How much of the answer actually addresses the topic." },
  { name: "Structure", body: "A recognisable opening, development and close." },
];

export default function Landing() {
  const seconds = useLoopingClock(MAX_RECORDING_SECONDS);

  return (
    <div className="min-h-screen">
      <header className="border-b border-line">
        <div className="mx-auto flex h-20 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8 lg:px-14">
          <Link to="/" className="block">
            <span className="display block text-[1.6rem] leading-[0.85]">Jessica</span>
            <Eyebrow className="mt-1.5">The Communicator</Eyebrow>
          </Link>
          <div className="flex items-center gap-3 sm:gap-5">
            <ThemeCycle compact />
            <Link
              to="/login"
              className="font-mono text-xs font-semibold uppercase tracking-[0.12em] text-muted underline decoration-1 underline-offset-[6px] hover:text-fg hover:decoration-signal"
            >
              Log in
            </Link>
            <Link to="/signup" className={`${buttonClass("primary")} max-sm:hidden`}>
              Start <Arrow />
            </Link>
          </div>
        </div>
      </header>

      {/* ------------------------------------------------------------ hero */}
      <section className="scene border-b-2 border-rule">
        <div className="mx-auto max-w-6xl px-5 pb-14 pt-12 sm:px-8 sm:pt-16 lg:px-14 lg:pb-20">
          <Eyebrow>Speaking practice · no preparation · AI feedback</Eyebrow>

          <h1 className="mt-8">
            <span className="display block text-[clamp(3.5rem,12vw,8.5rem)]">You get</span>

            {/* The clock is the headline, not an illustration beside it. */}
            <span className="plane my-3 block origin-left">
              <span className="offset-signal inline-block border-2 border-fg bg-surface px-5 py-2 sm:px-7">
                <Clock seconds={seconds} scale="hero" />
              </span>
            </span>

            <span className="display block text-[clamp(3.5rem,12vw,8.5rem)]">and no script.</span>
          </h1>

          <div className="mt-12 grid gap-8 border-t border-rule pt-8 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
            <p className="max-w-lg text-lg leading-relaxed">
              Jessica hands you a subject you did not pick, starts the clock, and then tells you
              how well you were actually understood. You cannot prepare for it. That is the
              point.
            </p>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
              <Link to="/signup" className={`${buttonClass("primary", "xl")} max-sm:w-full`}>
                Start speaking <Arrow />
              </Link>
              <Link to="/login" className={buttonClass("ghost")}>
                I have an account
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* --------------------------------------------------- the 3D object */}
      <section className="relative h-[220px] overflow-hidden border-b border-line sm:h-[300px]">
        <Suspense fallback={null}>
          <HeroScene />
        </Suspense>
        <div className="pointer-events-none absolute bottom-0 left-0 right-0">
          <div className="mx-auto max-w-6xl px-5 pb-5 sm:px-8 lg:px-14">
            <Eyebrow className="text-fg">Every voice has a shape. Jessica reads yours.</Eyebrow>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------- the loop */}
      <section aria-labelledby="loop">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 lg:px-14 lg:py-20">
          <div className="flex flex-wrap items-end justify-between gap-4 border-b border-rule pb-3">
            <h2 id="loop" className="eyebrow text-fg">
              How practice works
            </h2>
            <span className="font-mono text-xs text-muted">from topic to progress</span>
          </div>
          <ol className="grid sm:grid-cols-2 lg:grid-cols-7">
            {LOOP.map((step, i) => (
              <li
                key={step.head}
                className={`border-b border-line py-6 sm:pr-5 lg:border-b-0 lg:py-8 ${
                  i > 0 ? "lg:border-l lg:pl-5" : ""
                } ${i % 2 === 1 ? "sm:border-l sm:pl-5" : ""}`}
              >
                <span className="numeral block text-4xl text-signal-ink">{String(i + 1).padStart(2, "0")}</span>
                <h3 className="mt-5 font-display text-lg font-bold uppercase tracking-[-0.01em]">{step.head}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ------------------------------------------------------ dimensions */}
      <section aria-labelledby="scored" className="border-y border-line bg-surface">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 sm:px-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16 lg:px-14 lg:py-20">
          <div>
            <Eyebrow>What Jessica scores</Eyebrow>
            <h2 id="scored" className="display mt-4 text-[clamp(2.5rem,5.5vw,4.25rem)]">
              Judged on being followed.
            </h2>
            <p className="mt-5 max-w-md prose-body text-muted">
              Not on being right. Each dimension is scored from 0 to 100,
              with notes on what to change next.
            </p>
          </div>
          <dl className="border-t border-rule">
            {DIMENSIONS.map((d) => (
              <div key={d.name} className="grid gap-2 border-b border-line py-5 sm:grid-cols-[10rem_1fr] sm:gap-6">
                <dt className="font-mono text-sm font-semibold uppercase tracking-[0.12em]">{d.name}</dt>
                <dd className="prose-body text-muted">{d.body}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ------------------------------------------------------------ line */}
      <section>
        <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8 lg:px-14">
          <QuoteBlock seed={0} />
        </div>
      </section>

      <footer className="border-t-2 border-rule">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-6 px-5 py-8 sm:px-8 lg:px-14">
          <Eyebrow>Your voice is transcribed and scored by cloud services. The audio is not kept.</Eyebrow>
          <Link to="/signup" className={buttonClass("outline")}>
            Create an account <Arrow />
          </Link>
        </div>
      </footer>
    </div>
  );
}
