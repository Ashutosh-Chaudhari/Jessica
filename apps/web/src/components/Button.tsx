import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

const styles: Record<Variant, string> = {
  primary:
    "bg-emerald-400 text-zinc-950 font-semibold hover:bg-emerald-300 disabled:bg-emerald-400/40 disabled:text-zinc-950/50",
  secondary:
    "border border-zinc-700 text-zinc-100 hover:border-zinc-500 hover:bg-zinc-900",
  ghost: "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900",
  danger: "border border-red-900 text-red-300 hover:bg-red-950/40",
};

export function Button({ variant = "primary", className = "", ...rest }: Props) {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-sm transition-colors cursor-pointer disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 ${styles[variant]} ${className}`}
      {...rest}
    />
  );
}
