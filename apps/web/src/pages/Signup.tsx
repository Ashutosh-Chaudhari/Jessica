import { useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  AuthShell,
  ErrorNote,
  SubmitButton,
  handleAuthError,
  onSubmitGuard,
} from "./AuthParts";
import { useAuth } from "../hooks/useAuth";
import { PrivacyNote } from "../components/PrivacyNote";

export default function Signup() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const result = await signup(email, password, displayName);
      // Supabase can be configured to require a confirmation click first.
      if (result.needs_email_confirmation) setConfirmEmail(true);
      else navigate("/dashboard");
    } catch (e) {
      setError(handleAuthError(e));
    } finally {
      setBusy(false);
    }
  }

  if (confirmEmail) {
    return (
      <AuthShell title="Check your email">
        <p className="text-center text-sm leading-relaxed text-zinc-400">
          We sent a confirmation link to <span className="text-zinc-200">{email}</span>. Open it,
          then come back and log in.
        </p>
        <p className="mt-5 text-center text-sm">
          <Link to="/login" className="text-emerald-300 hover:text-emerald-200">
            Go to log in
          </Link>
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Create your account">
      <form onSubmit={onSubmitGuard(submit)} className="space-y-4">
        <input
          type="text"
          required
          placeholder="Display name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm outline-none placeholder:text-zinc-600 focus:border-emerald-400"
        />
        <input
          type="email"
          required
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm outline-none placeholder:text-zinc-600 focus:border-emerald-400"
        />
        <input
          type="password"
          required
          minLength={8}
          placeholder="Password (min 8 characters)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm outline-none placeholder:text-zinc-600 focus:border-emerald-400"
        />
        <ErrorNote message={error} />
        <SubmitButton busy={busy} label="Sign up" />
      </form>
      <PrivacyNote className="mt-5" />
      <p className="mt-5 text-center text-sm text-zinc-500">
        Have an account?{" "}
        <Link to="/login" className="text-emerald-300 hover:text-emerald-200">
          Log in
        </Link>
      </p>
    </AuthShell>
  );
}
