import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import { lineFor, type Line } from "../content/quotes";

/* ------------------------------------------------------------------ button */

type Variant = "primary" | "retry" | "outline" | "ghost" | "danger";

/* A block that sits ON the page: at rest it is flat, on hover it lifts off its
   own shadow, and pressing pushes it back down. Hover is the only time a shadow
   appears anywhere in the app. */
const BLOCK =
  "border-2 hover:-translate-x-[3px] hover:-translate-y-[3px] hover:shadow-[4px_4px_0_var(--rule)] active:translate-x-0 active:translate-y-0 active:shadow-none";

const VARIANTS: Record<Variant, string> = {
  primary: `bg-signal text-signal-fg border-signal ${BLOCK}`,
  // Retry gets its own colour so "do it again" never reads as "you did well".
  retry: `bg-amber text-amber-fg border-amber ${BLOCK}`,
  outline: "border-2 border-control bg-transparent text-fg hover:border-fg hover:bg-fg hover:text-bg active:translate-y-[1px]",
  ghost:
    "px-0 text-muted underline decoration-2 underline-offset-[6px] hover:text-fg hover:decoration-signal active:translate-y-[1px]",
  danger: `bg-live text-live-fg border-live ${BLOCK}`,
};

const SIZES = {
  md: "min-h-12 px-6 py-3 text-[0.8125rem]",
  lg: "min-h-14 px-8 py-3.5 text-sm",
  xl: "min-h-16 px-9 py-4 text-base",
} as const;

type Size = keyof typeof SIZES;

/** For links that should look like buttons - a <button> inside an <a> is not valid. */
export function buttonClass(variant: Variant = "primary", size: Size = "md"): string {
  return `relative inline-flex cursor-pointer select-none items-center justify-center gap-3 text-center font-mono sm:whitespace-nowrap font-bold uppercase tracking-[0.12em] transition-[transform,box-shadow,background-color,color,border-color] duration-150 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none disabled:hover:translate-x-0 disabled:hover:translate-y-0 ${
    variant === "ghost" ? "min-h-11 text-[0.8125rem]" : SIZES[size]
  } ${VARIANTS[variant]}`;
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** Waiting on the action this button started: disabled, announced, and a scan runs along its foot. */
  busy?: boolean;
}

export function Button({
  variant = "primary",
  size = "md",
  busy = false,
  className = "",
  disabled,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={`${buttonClass(variant, size)} ${className}`}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...rest}
    >
      {children}
      {busy && <span aria-hidden="true" className="scan absolute inset-x-0 bottom-0" />}
    </button>
  );
}

/** Read as decoration, not as "right arrow", by a screen reader. */
export function Arrow() {
  return <span aria-hidden="true">→</span>;
}

/* ------------------------------------------------------------------ labels */

export function Eyebrow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`eyebrow ${className}`}>{children}</p>;
}

/** A square label for facts about something: category, level, length, status. */
export function Tag({ children, tone = "plain" }: { children: ReactNode; tone?: "plain" | "signal" | "amber" }) {
  const tones = {
    plain: "border-control text-fg",
    signal: "border-signal text-signal-text",
    amber: "border-amber text-amber-text",
  };
  return (
    <span
      className={`inline-flex h-7 items-center border px-2.5 font-mono text-xs font-semibold uppercase tracking-[0.1em] ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/** The editorial page opener: a small label over a very large word, closed by a heavy rule. */
export function PageHeader({
  eyebrow,
  title,
  aside,
  children,
}: {
  eyebrow: string;
  title: ReactNode;
  /** Right-hand facts on wide screens - a date, a count. */
  aside?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="border-b-2 border-rule pb-6 sm:pb-8">
      <div className="flex items-start justify-between gap-8">
        <div className="min-w-0">
          <Eyebrow>{eyebrow}</Eyebrow>
          <h1 className="display mt-4 break-words text-[clamp(3rem,9vw,6.75rem)]">{title}</h1>
        </div>
        {aside && <div className="hidden shrink-0 pt-1 text-right sm:block">{aside}</div>}
      </div>
      {children}
    </header>
  );
}

/** A section opens on a full-strength hairline with its label above it. */
export function SectionHead({
  label,
  title,
  action,
  id,
}: {
  label: string;
  title?: string;
  action?: ReactNode;
  id?: string;
}) {
  return (
    <div className="flex min-h-9 items-end justify-between gap-4 border-b border-rule pb-2.5">
      <h2 id={id} className="eyebrow text-fg">
        {label}
      </h2>
      <div className="flex items-baseline gap-4">
        {title && <span className="font-mono text-xs text-muted max-sm:hidden">{title}</span>}
        {action}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------- data */

/** A number that means something, set on the page rather than in a box. */
export function Stat({
  label,
  value,
  accent = false,
  className = "",
}: {
  label: string;
  value: string;
  accent?: boolean;
  className?: string;
}) {
  return (
    <div className={`py-5 ${className}`}>
      <p className={`numeral whitespace-nowrap text-[clamp(2.25rem,3.4vw,3.25rem)] ${accent ? "text-signal-ink" : "text-fg"}`}>
        {value}
      </p>
      <p className="eyebrow mt-3">{label}</p>
    </div>
  );
}

/**
 * Stats on a ruled grid: two across on a phone, all in one row on a desk. The
 * hairlines are drawn by the grid (`.stat-grid` in index.css), so a cell never
 * has to know its position.
 */
export function StatGrid({ children, cols = 5 }: { children: ReactNode; cols?: 3 | 5 }) {
  return <div className={`stat-grid stat-grid--${cols}`}>{children}</div>;
}

/** A 0-100 dimension as ten hard segments - each one is ten points, no finer. */
export function Meter({ label, score }: { label: string; score: number }) {
  const clamped = Math.min(100, Math.max(0, score));
  const lit = Math.round(clamped / 10);

  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
      className="grid grid-cols-[1fr_auto] items-end gap-x-4 gap-y-2 sm:grid-cols-[8.5rem_1fr_3rem] sm:items-center"
    >
      <span className="font-mono text-sm font-semibold uppercase tracking-[0.1em]">{label}</span>
      <span className="numeral text-right text-2xl sm:order-last">{clamped}</span>
      <span className="col-span-2 flex h-2.5 gap-[3px] sm:col-span-1" aria-hidden="true">
        {Array.from({ length: 10 }, (_, i) => (
          <span
            key={i}
            className={`grow-in flex-1 ${i < lit ? "bg-signal" : "bg-line"}`}
            style={{ animationDelay: `${i * 30}ms` }}
          />
        ))}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ states */

/**
 * Empty and failed states share a shape on purpose: both are a place to act,
 * so both end in the action. `tone="error"` adds the amber bar - attention,
 * not alarm; red is kept for recording and for destroying things.
 */
export function StatePanel({
  label,
  title,
  children,
  actions,
  tone = "empty",
  className = "",
}: {
  label?: string;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
  tone?: "empty" | "error";
  className?: string;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : undefined}
      className={`border border-t-4 border-line-strong bg-surface p-6 sm:p-10 ${
        tone === "error" ? "border-t-amber" : "border-t-fg"
      } ${className}`}
    >
      {label && <Eyebrow className={tone === "error" ? "text-amber-text" : ""}>{label}</Eyebrow>}
      <p className="display mt-4 text-[clamp(2rem,4.4vw,3.25rem)]">{title}</p>
      {children && <div className="mt-5 max-w-xl space-y-2 prose-body text-muted">{children}</div>}
      {actions && <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4">{actions}</div>}
    </div>
  );
}

/** Named for what is being waited on - never a bare spinner. */
export function LoadingState({ label, className = "" }: { label: string; className?: string }) {
  return (
    <div role="status" className={`max-w-sm py-8 ${className}`}>
      <p className="eyebrow">{label}</p>
      <div className="scan mt-4" />
    </div>
  );
}

/* ------------------------------------------------------------------- quote */

export function QuoteBlock({ seed, className = "" }: { seed: number; className?: string }) {
  const line: Line = lineFor(seed);
  return (
    <figure className={`grid gap-3 border-t border-rule pt-5 sm:grid-cols-[12rem_1fr] ${className}`}>
      <Eyebrow>On {line.on}</Eyebrow>
      <blockquote className="headline max-w-2xl text-xl sm:text-2xl">{line.text}</blockquote>
    </figure>
  );
}

/* -------------------------------------------------------------------- form */

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
}

export function Field({ label, hint, id, className = "", ...rest }: FieldProps) {
  return (
    <label htmlFor={id} className="block">
      <span className="eyebrow text-fg">{label}</span>
      <input
        id={id}
        className={`mt-2.5 h-12 w-full border border-control bg-surface px-3.5 font-mono text-sm text-fg outline-none transition-colors placeholder:text-faint hover:border-fg focus:border-signal ${className}`}
        {...rest}
      />
      {hint && <span className="mt-2 block font-mono text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Notice({
  tone = "error",
  children,
}: {
  tone?: "error" | "info";
  children: ReactNode;
}) {
  return (
    <p
      role={tone === "error" ? "alert" : undefined}
      className={`border-l-4 bg-surface px-4 py-3 font-mono text-sm ${
        tone === "error" ? "border-amber text-amber-text" : "border-signal text-fg"
      }`}
    >
      {children}
    </p>
  );
}
