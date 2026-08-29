import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { AuthShell, ErrorNote, SubmitButton, handleAuthError, onSubmitGuard } from "./AuthParts";
import { useAuth } from "../hooks/useAuth";
import { Field } from "../components/primitives";
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
      <AuthShell title="Check your email" seed={2}>
        <p className="prose-body">
          We sent a confirmation link to <span className="font-bold">{email}</span>. Open it, then
          come back and log in.
        </p>
        <Link
          to="/login"
          className="mt-6 inline-block font-mono text-sm font-bold uppercase tracking-[0.1em] underline decoration-2 underline-offset-4 hover:text-signal-text"
        >
          Go to log in
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Two minutes from now you will be talking."
      intro="No preparation, no topic list to study, nothing to read first. Make an account and the clock starts."
      seed={1}
    >
      <form onSubmit={onSubmitGuard(submit)} className="space-y-5">
        <Field
          id="name"
          label="What should we call you?"
          type="text"
          required
          maxLength={60}
          autoComplete="name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
        <Field
          id="email"
          label="Email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Field
          id="password"
          label="Password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          hint="At least 8 characters."
        />
        <ErrorNote message={error} />
        <SubmitButton busy={busy} label="Create account" />
      </form>

      <PrivacyNote className="mt-6" />

      <p className="mt-6 border-t-2 rule pt-5 font-mono text-sm uppercase tracking-[0.1em] text-muted">
        Already have one?{" "}
        <Link to="/login" className="text-fg underline decoration-2 underline-offset-4 hover:text-signal-text">
          Log in
        </Link>
      </p>
    </AuthShell>
  );
}
