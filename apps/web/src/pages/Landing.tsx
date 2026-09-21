import { Suspense, lazy } from "react";
import { Link } from "react-router";
import { MAX_RECORDING_SECONDS, DURATION_OPTIONS } from "@jessica/types";
import { Button, Eyebrow, QuoteBlock } from "../components/primitives";
import { Clock, useLoopingClock } from "../components/Clock";
import { ThemeCycle } from "../components/ThemeToggle";

// Three.js is ~150KB. Split it out so it never blocks the first paint of the
// headline, which is the thing people actually came to read.
const HeroScene = lazy(() => import("../components/HeroScene"));

/**
 * The sequence is numbered because it genuinely is one - you cannot be scored
 * before you speak, or speak before you are given something to speak about.
 */
const STEPS = [
  {
    n: "01",
    head: "A topic arrives",
    body: "You did not choose it and you have not seen it before. That is the whole exercise.",
  },
  {
    n: "02",
    head: "You talk",
    body: `You set the clock - ${DURATION_OPTIONS.map((o) => o.label).join(", ")} - then talk, out loud, with nothing written down.`,
  },
  {
    n: "03",
    head: "You find out how it landed",
    body: "Fluency, coherence, vocabulary, relevance, structure. Judged on being followed, not on being right.",
  },
];

export default function Landing() {
  const seconds = useLoopingClock(MAX_RECORDING_SECONDS);

  return (
    <div className="min-h-screen">
      <header className="border-b-2 rule">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <div>
            <span className="display block text-xl leading-none">Jessica</span>
            <Eyebrow>The Communicator</Eyebrow>
          </div>
          <div className="flex items-center gap-3">
            <ThemeCycle />
            <Link
              to="/login"
              className="font-mono text-sm font-bold uppercase tracking-[0.1em] underline decoration-2 underline-offset-4 hover:text-signal-text"
            >
              Log in
            </Link>
          </div>
        </div>
      </header>

      {/* ------------------------------------------------------------ hero */}
      <section className="scene border-b-2 rule">
        <div className="mx-auto max-w-5xl px-4 pb-14 pt-12 sm:pt-16">
          <Eyebrow>Speaking practice · no preparation</Eyebrow>

          <h1 className="mt-6">
            <span className="display block text-[13vw] sm:text-[9vw] lg:text-[7.5rem]">
              You get
            </span>

            {/* The clock is the headline, not an illustration beside it. */}
            <span className="plane my-2 block origin-left">
              <span className="inline-block border-2 rule bg-surface px-5 py-2 hard-shadow">
                <Clock seconds={seconds} scale="hero" />
              </span>
            </span>

            <span className="display block text-[13vw] sm:text-[9vw] lg:text-[7.5rem]">
              and no script.
            </span>
          </h1>

          <div className="mt-10 grid gap-8 border-t-2 rule pt-8 sm:grid-cols-[1fr_auto] sm:items-end">
            <p className="max-w-md prose-body text-fg">
              Jessica hands you a subject you did not pick, starts the clock, and then tells
              you how well you were actually understood. You cannot prepare for it. That is
              the point.
            </p>

            <div className="flex flex-wrap items-center gap-4">
              <Link to="/signup">
                <Button className="px-8 py-4 text-base">Start speaking</Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* --------------------------------------------------- the 3D object */}
      <section className="relative h-[240px] overflow-hidden border-b-2 rule sm:h-[300px]">
        <Suspense fallback={null}>
          <HeroScene />
        </Suspense>
        <div className="pointer-events-none absolute bottom-0 left-0 right-0">
          <div className="mx-auto max-w-5xl px-4 pb-4">
            <Eyebrow>Every voice has a shape. Jessica reads yours.</Eyebrow>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ line */}
      <section className="border-b-2 rule bg-surface">
        <div className="mx-auto max-w-5xl px-4 py-8">
          <QuoteBlock seed={0} className="border-t-0 pt-0" />
        </div>
      </section>

      {/* --------------------------------------------------------- sequence */}
      <section>
        <div className="mx-auto max-w-5xl px-4 py-12">
          <Eyebrow>How one challenge goes</Eyebrow>
          <ol className="mt-6 grid gap-0 sm:grid-cols-3">
            {STEPS.map((s, i) => (
              <li
                key={s.n}
                className={`border-2 rule p-6 ${i > 0 ? "sm:border-l-0 max-sm:border-t-0" : ""}`}
              >
                <span className="display block text-4xl text-signal-text">{s.n}</span>
                <h2 className="mt-4 font-display text-lg font-bold uppercase tracking-tight">
                  {s.head}
                </h2>
                <p className="mt-2 prose-body text-muted">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <footer className="border-t-2 rule">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-4 py-6">
          <Eyebrow>Your voice is transcribed and scored by cloud services</Eyebrow>
          <Link
            to="/signup"
            className="font-mono text-sm font-bold uppercase tracking-[0.1em] underline decoration-2 underline-offset-4 hover:text-signal-text"
          >
            Create an account
          </Link>
        </div>
      </footer>
    </div>
  );
}
