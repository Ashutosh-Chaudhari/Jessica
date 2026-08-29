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
    <AuthShell title="Welcome back">
      <form onSubmit={onSubmitGuard(submit)} className="space-y-4">
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
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm outline-none placeholder:text-zinc-600 focus:border-emerald-400"
        />
        <ErrorNote message={error} />
        <SubmitButton busy={busy} label="Log in" />
      </form>
      <p className="mt-5 text-center text-sm text-zinc-500">
        New here?{" "}
        <Link to="/signup" className="text-emerald-300 hover:text-emerald-200">
          Create an account
        </Link>
      </p>
    </AuthShell>
  );
}
