import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import { lineFor, type Line } from "../content/quotes";

/* ------------------------------------------------------------------ button */

type Variant = "primary" | "outline" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  // The offset block is the whole design language: a slab that sits ON the
  // page rather than glowing inside it, and presses flat when you click it.
  primary:
    "bg-signal text-signal-fg border-2 rule hard-shadow hover:-translate-x-[3px] hover:-translate-y-[3px] active:translate-x-0 active:translate-y-0 active:shadow-none",
  outline:
    "bg-surface text-fg border-2 rule hard-shadow hover:-translate-x-[3px] hover:-translate-y-[3px] active:translate-x-0 active:translate-y-0 active:shadow-none",
  ghost: "text-muted hover:text-fg underline underline-offset-4 decoration-2",
  danger:
    "bg-live text-live-fg border-2 rule hard-shadow hover:-translate-x-[3px] hover:-translate-y-[3px] active:translate-x-0 active:translate-y-0 active:shadow-none",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

export function Button({ variant = "primary", className = "", ...rest }: ButtonProps) {
  return (
    <button
      className={`inline-flex cursor-pointer items-center justify-center gap-2 px-6 py-3 font-mono text-sm font-bold uppercase tracking-[0.1em] transition-transform disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-x-0 disabled:hover:translate-y-0 ${VARIANTS[variant]} ${className}`}
      {...rest}
    />
  );
}

/* ----------------------------------------------------------------- surfaces */

export function Slab({
  children,
  className = "",
  lift = false,
}: {
  children: ReactNode;
  className?: string;
  lift?: boolean;
}) {
  return (
    <div
      className={`border-2 rule bg-surface hard-shadow ${lift ? "lift" : ""} ${className}`}
    >
      {children}
    </div>
  );
}

export function Eyebrow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`eyebrow ${className}`}>{children}</p>;
}

/** A labelled section head: the rule and the label are the structure. */
export function SectionHead({ label, title }: { label: string; title?: string }) {
  return (
    <div className="border-b-2 rule pb-2">
      <div className="flex items-baseline justify-between gap-4">
        <Eyebrow>{label}</Eyebrow>
        {title && <span className="font-mono text-xs text-muted">{title}</span>}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------- data */

/** A number that means something, set like a readout on studio equipment. */
export function Readout({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="border-2 rule bg-surface p-4">
      <p
        className={`display tabular text-3xl sm:text-4xl ${accent ? "text-signal-text" : "text-fg"}`}
      >
        {value}
      </p>
      <p className="eyebrow mt-2">{label}</p>
    </div>
  );
}

/** A 0-100 dimension, drawn as a VU meter rather than a rounded progress bar. */
export function Meter({ label, score }: { label: string; score: number }) {
  const clamped = Math.min(100, Math.max(0, score));
  const segments = 20;
  const lit = Math.round((clamped / 100) * segments);

  return (
    <div className="grid grid-cols-[7rem_1fr_2.5rem] items-center gap-3">
      <span className="font-mono text-sm uppercase tracking-[0.1em] text-muted">{label}</span>
      <div className="flex h-4 gap-[3px]" aria-hidden="true">
        {Array.from({ length: segments }, (_, i) => (
          <span
            key={i}
            className={`flex-1 border rule ${
              i < lit ? (i >= segments - 4 ? "bg-live" : i >= segments - 8 ? "bg-amber" : "bg-signal") : "bg-transparent"
            }`}
          />
        ))}
      </div>
      <span className="tabular text-right font-mono text-sm font-bold">{clamped}</span>
    </div>
  );
}

/* ------------------------------------------------------------------- quote */

export function QuoteBlock({ seed, className = "" }: { seed: number; className?: string }) {
  const line: Line = lineFor(seed);
  return (
    <figure className={`border-t-2 rule pt-4 ${className}`}>
      <Eyebrow>On {line.on}</Eyebrow>
      <blockquote className="mt-2 font-display text-lg font-semibold leading-tight tracking-tight sm:text-xl">
        {line.text}
      </blockquote>
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
      <span className="eyebrow">{label}</span>
      <input
        id={id}
        className={`mt-2 w-full border-2 rule bg-bg px-3 py-3 font-mono text-sm text-fg outline-none placeholder:text-muted focus:bg-surface ${className}`}
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
  const border = tone === "error" ? "border-live" : "rule";
  const text = tone === "error" ? "text-live-text" : "text-fg";
  return (
    <p className={`border-l-4 ${border} bg-surface px-3 py-2 font-mono text-sm ${text}`}>
      {children}
    </p>
  );
}
