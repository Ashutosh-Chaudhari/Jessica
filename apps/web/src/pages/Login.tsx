import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { AuthShell, ErrorNote, SubmitButton, handleAuthError, onSubmitGuard } from "./AuthParts";
import { useAuth } from "../hooks/useAuth";
import { Field } from "../components/primitives";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      navigate("/dashboard");
    } catch (e) {
      setError(handleAuthError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Back for another?"
      intro="Pick up where you left off. Your streak is waiting and it does not care how busy the week was."
      seed={7}
    >
      <form onSubmit={onSubmitGuard(submit)} className="space-y-5">
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
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <ErrorNote message={error} />
        <SubmitButton busy={busy} label="Log in" />
      </form>

      <p className="mt-6 border-t-2 rule pt-5 font-mono text-sm uppercase tracking-[0.1em] text-muted">
        No account yet?{" "}
        <Link to="/signup" className="text-fg underline decoration-2 underline-offset-4 hover:text-signal-text">
          Create one
        </Link>
      </p>
    </AuthShell>
  );
}
