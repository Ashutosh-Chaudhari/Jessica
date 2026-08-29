import { useEffect, useState } from "react";
import { formatClock } from "../hooks/format";

/**
 * The signature element. Jessica's whole premise is an unexpected topic and a
 * running clock, so the clock is the hero rather than a picture of the product
 * or a headline about it. The same component runs on the landing page and
 * during a real challenge - what you see before signing up is the thing you
 * will actually face.
 */
export function Clock({
  seconds,
  live = false,
  scale = "page",
}: {
  seconds: number;
  live?: boolean;
  /** "hero" is the monumental landing treatment; "page" is in-task. */
  scale?: "hero" | "page";
}) {
  const size =
    scale === "hero"
      ? "text-[22vw] leading-[0.78] sm:text-[16vw] lg:text-[13rem]"
      : "text-7xl sm:text-8xl";

  return (
    <div className="relative inline-block">
      <span
        className={`display tabular block ${size} ${live ? "text-live-text" : "text-fg"}`}
        // Read as a whole value, not digit by digit, by a screen reader.
        aria-label={`${Math.floor(seconds / 60)} minutes ${seconds % 60} seconds remaining`}
        role="timer"
      >
        {formatClock(seconds)}
      </span>
    </div>
  );
}

/** The ON AIR lamp. Red is spent only here, so it still means something. */
export function LiveLamp({ live }: { live: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 border-2 rule bg-surface px-3 py-1.5">
      <span
        className={`inline-block h-2.5 w-2.5 rounded-full ${
          live ? "animate-pulse bg-live" : "bg-muted"
        }`}
      />
      <span className="font-mono text-sm font-bold uppercase tracking-[0.1em]">
        {live ? "On air" : "Standby"}
      </span>
    </span>
  );
}

/**
 * Loops the landing-page clock so the pressure is legible before you sign up.
 * Frozen for anyone who asked for reduced motion - an ambient ticking clock is
 * decoration, and they have said they do not want it.
 */
export function useLoopingClock(from: number, enabled = true): number {
  const [seconds, setSeconds] = useState(from);

  useEffect(() => {
    if (!enabled) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const id = setInterval(() => {
      setSeconds((s) => (s <= 0 ? from : s - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [from, enabled]);

  return seconds;
}
