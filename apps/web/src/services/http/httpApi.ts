import { createClient } from "@supabase/supabase-js";
import {
  API_ERROR_MESSAGES,
  type ActiveChallenge,
  type ApiError,
  type AuthUser,
  type HistoryEntry,
  type ProgressStats,
  type SignupResult,
  type StartChallengeResponse,
  type SubmitChallengeResponse,
} from "@jessica/types";
import type { JessicaApi } from "../api";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";
/** Empty means same origin - which is how the deployed Worker serves this app. */
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

// The placeholders keep this module importable when the app runs on mocks;
// nothing calls into the client in that mode.
export const supabase = createClient(
  SUPABASE_URL || "http://localhost:54321",
  SUPABASE_ANON_KEY || "anon-key-not-configured",
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } },
);

export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

function toAuthUser(user: { id: string; email?: string; user_metadata?: Record<string, unknown> }): AuthUser {
  const name = user.user_metadata?.display_name;
  return {
    id: user.id,
    email: user.email ?? "",
    display_name:
      (typeof name === "string" && name.trim()) || user.email?.split("@")[0] || "there",
  };
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  const headers = new Headers(init.headers);
  if (token) headers.set("authorization", `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(`${API_BASE}/api${path}`, { ...init, headers });
  } catch {
    throw new Error("Could not reach Jessica. Check your connection and try again.");
  }

  if (!response.ok) {
    // The Worker always sends a user-safe message; this is the fallback for
    // anything that did not come from the Worker at all (proxy, 502, ...).
    const body = (await response.json().catch(() => null)) as ApiError | null;
    throw new Error(body?.message ?? API_ERROR_MESSAGES.internal);
  }

  return (await response.json()) as T;
}

const auth = {
  async getSession(): Promise<AuthUser | null> {
    const { data } = await supabase.auth.getSession();
    return data.session?.user ? toAuthUser(data.session.user) : null;
  },

  async login(email: string, password: string): Promise<AuthUser> {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    if (!data.user) throw new Error("Login failed. Please try again.");
    return toAuthUser(data.user);
  },

  async signup(email: string, password: string, displayName: string): Promise<SignupResult> {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName.trim() } },
    });
    if (error) throw new Error(error.message);
    // No session means the project requires email confirmation first.
    if (!data.session) return { user: null, needs_email_confirmation: true };
    return { user: data.user ? toAuthUser(data.user) : null, needs_email_confirmation: false };
  },

  async logout(): Promise<void> {
    await supabase.auth.signOut();
  },
};

const challenges = {
  start: () => request<StartChallengeResponse>("/challenges/start", { method: "POST" }),

  getCurrent: async (): Promise<ActiveChallenge | null> =>
    (await request<{ challenge: ActiveChallenge | null }>("/challenges/current")).challenge,

  submit: (
    challengeId: string,
    audio: Blob,
    durationSeconds: number,
    maxDurationSeconds: number,
  ) => {
    const form = new FormData();
    form.append("audio", audio, "speech.webm");
    // The server measures the real duration from the audio; this is only for logs.
    form.append("client_duration_seconds", String(durationSeconds));
    form.append("max_duration_seconds", String(maxDurationSeconds));
    return request<SubmitChallengeResponse>(`/challenges/${challengeId}/submit`, {
      method: "POST",
      body: form,
    });
  },

  retry: (challengeId: string) =>
    request<StartChallengeResponse>(`/challenges/${challengeId}/retry`, { method: "POST" }),

  skip: async (challengeId: string): Promise<void> => {
    await request(`/challenges/${challengeId}/skip`, { method: "POST" });
  },
};

const profile = {
  updateDisplayName: async (displayName: string): Promise<string> => {
    const res = await request<{ display_name: string }>("/profile", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ display_name: displayName }),
    });
    return res.display_name;
  },

  deleteAccount: async (): Promise<void> => {
    await request("/profile", { method: "DELETE" });
    // The rows are gone; drop the now-orphaned session too.
    await supabase.auth.signOut();
  },
};

const progress = {
  getStats: () => request<ProgressStats>("/progress"),
  getHistory: () => request<HistoryEntry[]>("/history"),
};

export const httpApi: JessicaApi = { auth, challenges, profile, progress };
