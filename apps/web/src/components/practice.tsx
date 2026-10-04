import type { ReactNode } from "react";
import { formatClock } from "../hooks/format";

/**
 * The practice room's fixtures. Each piece only displays what the page already
 * knows - the recorder, the clock and the handlers all stay in Challenge.tsx -
 * so restyling these can never change how a recording is made.
 */

/** "FUTURE SCENARIOS / LEVEL 2 OF 3 / TARGET 2:00" - facts set like a run-sheet line. */
export function MetaLine({ items }: { items: ReactNode[] }) {
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs font-semibold uppercase tracking-[0.14em] text-muted">
      {items.map((item, i) => (
        <span key={i} className="inline-flex items-center gap-3">
          {i > 0 && (
            <span aria-hidden="true" className="text-faint">
              /
            </span>
          )}
          {item}
        </span>
      ))}
    </p>
  );
}

/** The question, given the whole width and the biggest readable setting. */
export function Question({ children, size = "lg" }: { children: string; size?: "lg" | "md" }) {
  return (
    <h1
      className={`headline relative max-w-[24ch] ${
        size === "lg"
          ? "text-[clamp(2rem,4.8vw,4.25rem)]"
          : "text-[clamp(1.375rem,2.6vw,2rem)] text-muted"
      }`}
    >
      <span aria-hidden="true" className="absolute -left-[0.55em] top-0 text-signal-ink max-md:hidden">
        “
      </span>
      {children}
    </h1>
  );
}

function MicGlyph({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="8.5" y="2.5" width="7" height="12" rx="3.5" />
      <path d="M5 11.5a7 7 0 0 0 14 0M12 18.5V22M8 22h8" strokeLinecap="square" />
    </svg>
  );
}

/**
 * The large microphone control. One button: the square is the target your
 * thumb finds, the words say what it does.
 */
export function MicButton({
  onClick,
  starting,
  disabled,
}: {
  onClick: () => void;
  starting: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || starting}
      aria-busy={starting || undefined}
      className="group flex w-full cursor-pointer items-stretch border-2 border-signal bg-signal text-signal-fg transition-[transform,box-shadow] duration-150 hover:-translate-x-[3px] hover:-translate-y-[3px] hover:shadow-[4px_4px_0_var(--rule)] active:translate-x-0 active:translate-y-0 active:shadow-none disabled:cursor-progress disabled:opacity-60 disabled:hover:translate-x-0 disabled:hover:translate-y-0 disabled:hover:shadow-none"
    >
      <span className="flex w-16 shrink-0 items-center justify-center border-r-2 border-signal-fg/20 sm:w-24">
        <MicGlyph className={`h-9 w-9 sm:h-10 sm:w-10 ${starting ? "animate-pulse" : ""}`} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col items-start justify-center px-4 py-4 text-left sm:px-5">
        <span className="font-mono text-base font-bold uppercase tracking-[0.12em]">
          {starting ? "Waiting for the microphone" : "Start speaking"}
        </span>
        <span className="mt-1 font-mono text-xs opacity-75">
          {starting ? "Allow microphone access if your browser asks" : "The clock starts when the microphone opens"}
        </span>
      </span>
      {!starting && (
        <span aria-hidden="true" className="flex items-center pr-4 font-mono text-xl sm:pr-6">
          →
        </span>
      )}
    </button>
  );
}

/** The stop control, the same size as the one that started it. */
export function FinishButton({ onClick, timeUp }: { onClick: () => void; timeUp: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex w-full max-w-md cursor-pointer items-stretch border-2 text-left transition-[transform,box-shadow] duration-150 hover:-translate-x-[3px] hover:-translate-y-[3px] hover:shadow-[4px_4px_0_var(--rule)] active:translate-x-0 active:translate-y-0 active:shadow-none ${
        timeUp ? "border-amber bg-amber text-amber-fg" : "border-fg bg-fg text-bg"
      }`}
    >
      <span className="flex w-16 shrink-0 items-center justify-center sm:w-24">
        <span aria-hidden="true" className={`h-7 w-7 sm:h-8 sm:w-8 ${timeUp ? "bg-amber-fg" : "bg-live"}`} />
      </span>
      <span className="flex flex-1 flex-col justify-center px-5 py-4">
        <span className="font-mono text-base font-bold uppercase tracking-[0.12em]">
          {timeUp ? "Send it" : "Finish"}
        </span>
        <span className="mt-1 font-mono text-xs opacity-70">Stop and send for feedback</span>
      </span>
    </button>
  );
}

/** Elapsed over total, in timecode. The one thing on screen that moves on its own. */
export function RecordingTimer({ elapsed, total, live }: { elapsed: number; total: number; live: boolean }) {
  return (
    <p
      role="timer"
      aria-label={`${Math.floor(elapsed / 60)} minutes ${elapsed % 60} seconds of ${Math.floor(total / 60)} minutes ${total % 60} seconds`}
      className="flex flex-wrap items-baseline gap-x-4 font-mono font-semibold tabular-nums"
    >
      <span className={`text-[clamp(4.5rem,17vw,10.5rem)] leading-[0.85] tracking-[-0.04em] ${live ? "text-fg" : "text-amber-text"}`}>
        {formatClock(elapsed)}
      </span>
      <span className="text-[clamp(1.5rem,4vw,2.75rem)] leading-none text-faint">/ {formatClock(total)}</span>
    </p>
  );
}

const BAR_HEIGHTS = [0.4, 0.7, 0.55, 0.9, 0.6, 0.8, 0.45, 1, 0.65, 0.5, 0.85, 0.6, 0.75, 0.4, 0.95, 0.55];

/**
 * The "take is running" indicator. A steady rhythm, not a level meter: the page
 * has no access to the microphone signal (the recorder owns it), so it would be
 * dishonest to draw bars that look like they respond to your voice.
 */
export function ActivityBars({ running }: { running: boolean }) {
  const bars = Array.from({ length: 48 }, (_, i) => BAR_HEIGHTS[i % BAR_HEIGHTS.length]!);
  return (
    <div
      aria-hidden="true"
      className={`flex h-16 items-center gap-[3px] sm:h-20 ${running ? "pulse-bars" : ""}`}
    >
      {bars.map((h, i) => (
        <span
          key={i}
          className={`h-full flex-1 ${running ? "bg-live" : "bg-line-strong"}`}
          style={{ ["--i" as string]: i, ["--h" as string]: h, transform: running ? undefined : `scaleY(${0.15 + h * 0.2})` }}
        />
      ))}
    </div>
  );
}

/** Time spent against the limit, with the minimum that counts marked on the track. */
export function ElapsedTrack({ elapsed, total, minimum }: { elapsed: number; total: number; minimum: number }) {
  const SEGMENTS = 30;
  const lit = Math.round((elapsed / total) * SEGMENTS);
  const minAt = (minimum / total) * 100;
  const reached = elapsed >= minimum;

  return (
    <div>
      <div className="relative">
        <div aria-hidden="true" className="flex h-3 gap-[3px]">
          {Array.from({ length: SEGMENTS }, (_, i) => (
            <span key={i} className={`flex-1 ${i < lit ? "bg-fg" : "bg-line"}`} />
          ))}
        </div>
        <span aria-hidden="true" className="absolute -bottom-2 -top-2 w-0.5 bg-signal" style={{ left: `${minAt}%` }} />
      </div>
      <p className="mt-4 font-mono text-xs uppercase tracking-[0.12em] text-muted">
        {reached ? (
          <span className="text-signal-text">{minimum}-second minimum reached</span>
        ) : (
          <>{minimum}-second minimum · {minimum - elapsed}s to go</>
        )}
      </p>
    </div>
  );
}

/** What the scorer actually returns, so the waiting screen promises nothing more. */
const CHECKED = ["Transcript", "Fluency", "Coherence", "Vocabulary", "Relevance", "Structure", "Filler words"];

/** The waiting room: what is being worked out. The highlight loops because the
 *  checks run together - it never ticks one off as done. */
export function ProcessingChecklist() {
  return (
    <ol className="sweep grid border-t border-line sm:grid-cols-2 lg:grid-cols-4">
      {CHECKED.map((item, i) => (
        <li
          key={item}
          style={{ ["--i" as string]: i }}
          className="border-b border-l-2 border-b-line border-l-transparent py-4 pl-4 font-mono text-sm uppercase tracking-[0.12em] text-muted"
        >
          {item}
        </li>
      ))}
    </ol>
  );
}
