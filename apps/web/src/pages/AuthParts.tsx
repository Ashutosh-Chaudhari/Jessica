import type { FormEvent, ReactNode } from "react";
import { Card } from "../components/Card";

export function AuthShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <p className="font-mono text-xs uppercase tracking-[0.35em] text-zinc-500 mb-8">
        Jessica
      </p>
      <Card className="w-full max-w-sm p-8">
        <h1 className="mb-6 text-center text-lg font-semibold">{title}</h1>
        {children}
      </Card>
    </div>
  );
}

export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-300">
      {message}
    </p>
  );
}

export function SubmitButton({
  busy,
  label,
}: {
  busy: boolean;
  label: string;
}) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="w-full cursor-pointer rounded-lg bg-emerald-400 px-5 py-2.5 text-sm font-semibold text-zinc-950 transition-colors hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-emerald-400/40"
    >
      {busy ? "Please wait…" : label}
    </button>
  );
}

export function handleAuthError(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong. Please try again.";
}

export function onSubmitGuard(fn: () => Promise<void>) {
  return (e: FormEvent) => {
    e.preventDefault();
    void fn();
  };
}
