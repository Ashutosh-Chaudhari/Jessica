import type { FormEvent, ReactNode } from "react";
import { Link } from "react-router";
import { Button, Eyebrow, Notice, QuoteBlock } from "../components/primitives";
import { ThemeCycle } from "../components/ThemeToggle";

export function AuthShell({
  title,
  intro,
  children,
  seed = 4,
}: {
  title: string;
  intro?: string;
  children: ReactNode;
  seed?: number;
}) {
  return (
    <div className="min-h-screen">
      <header className="border-b-2 rule">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <Link to="/">
            <span className="display block text-xl leading-none">Jessica</span>
            <Eyebrow>The Communicator</Eyebrow>
          </Link>
          <ThemeCycle />
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl gap-10 px-4 py-12 lg:grid-cols-2 lg:gap-16">
        <div>
          <h1 className="display text-5xl sm:text-6xl">{title}</h1>
          {intro && (
            <p className="mt-5 max-w-sm prose-body text-muted">{intro}</p>
          )}
          <QuoteBlock seed={seed} className="mt-10 hidden lg:block" />
        </div>

        <div className="border-2 rule bg-surface p-6 hard-shadow sm:p-8">{children}</div>
      </main>
    </div>
  );
}

export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return <Notice>{message}</Notice>;
}

export function SubmitButton({ busy, label }: { busy: boolean; label: string }) {
  return (
    <Button type="submit" disabled={busy} className="w-full py-4">
      {busy ? "Working…" : label}
    </Button>
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
