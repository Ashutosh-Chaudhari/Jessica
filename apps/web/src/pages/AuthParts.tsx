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

/**
 * Supabase's raw auth errors are terse and sometimes actively misleading - an
 * unconfirmed account gets "Invalid login credentials", the same text a wrong
 * password gets. Translate the ones users actually hit into something that says
 * what to do next; fall through to the original message otherwise.
 */
const AUTH_MESSAGES: [RegExp, string][] = [
  [
    // Supabase returns this same text whether the email is unknown or the
    // password is wrong - deliberately, so no one can probe which emails have
    // accounts. Keep it combined; naming which half failed would leak that.
    /invalid login credentials|invalid credentials/i,
    "Your email or password is incorrect. Check both and try again.",
  ],
  [
    // Only reachable if email confirmation is turned back on in Supabase.
    /email not confirmed/i,
    "Please confirm your email first — open the link we sent you, then log in.",
  ],
  [
    /rate limit|you can only request this after|too many requests/i,
    "Too many attempts from here just now. Wait a minute, then try again.",
  ],
  [
    // Signup is the safe place to reveal an existing account: the person is
    // asking to create one, not guessing at someone else's address.
    /already registered|already been registered|user already exists/i,
    "An account with this email already exists. Try logging in instead.",
  ],
  [
    /password.*(least|6 characters|too short)|weak|pwned|known to be/i,
    "Please choose a longer, less common password — at least 8 characters.",
  ],
];

export function handleAuthError(e: unknown): string {
  if (!(e instanceof Error)) return "Something went wrong. Please try again.";
  for (const [pattern, message] of AUTH_MESSAGES) {
    if (pattern.test(e.message)) return message;
  }
  return e.message || "Something went wrong. Please try again.";
}

export function onSubmitGuard(fn: () => Promise<void>) {
  return (e: FormEvent) => {
    e.preventDefault();
    void fn();
  };
}
