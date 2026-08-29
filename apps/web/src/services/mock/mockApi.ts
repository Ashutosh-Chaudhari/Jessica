import type {
  ActiveChallenge,
  Attempt,
  AttemptStatus,
  AuthUser,
  Challenge,
  Evaluation,
  HistoryEntry,
  ProgressStats,
  SignupResult,
  StartChallengeResponse,
  SubmitChallengeResponse,
} from "@jessica/types";
import {
  FAIL_MESSAGES,
  FALLBACK_TOPICS,
  MAX_RECORDING_SECONDS,
  applyPassRules,
  computeProgress,
  computeTotals,
} from "@jessica/types";
import type { JessicaApi } from "../api";
import { MOCK_FEEDBACK_GOOD, MOCK_FEEDBACK_IMPROVE, MOCK_TRANSCRIPTS } from "./data";
import { mockStore } from "./store";

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function mockTranscript(durationSeconds: number): string {
  if (durationSeconds < 45) {
    return "I think this topic is interesting but I am not sure what to say about it.";
  }
  return durationSeconds > 80 ? MOCK_TRANSCRIPTS[0]! : MOCK_TRANSCRIPTS[1]!;
}

function mockEvaluate(
  challenge: Challenge,
  durationSeconds: number,
): SubmitChallengeResponse {
  const transcript = mockTranscript(durationSeconds);
  // Longer, on-topic answers score higher in the prototype.
  const base = Math.min(95, 45 + Math.round((durationSeconds / MAX_RECORDING_SECONDS) * 50));
  const jitter = () => Math.max(30, Math.min(98, base + Math.floor(Math.random() * 17) - 8));
  const relevance = jitter();
  const fluency = jitter();
  const coherence = jitter();
  const vocabulary = jitter();
  const structure = jitter();
  const overall = Math.round((fluency + coherence + vocabulary + relevance + structure) / 5);

  // Same deterministic rules the Worker applies (spec sections 38-39).
  const { passed, reason } = applyPassRules(durationSeconds, transcript, relevance);

  const good = [...MOCK_FEEDBACK_GOOD].sort(() => Math.random() - 0.5).slice(0, 2);
  const improve = [...MOCK_FEEDBACK_IMPROVE].sort(() => Math.random() - 0.5).slice(0, 2);

  const evaluation: Evaluation = {
    overall,
    fluency,
    coherence,
    vocabulary,
    relevance,
    structure,
    filler_count: Math.max(0, Math.round((100 - fluency) / 4)),
    feedback: [...good, ...improve],
    passed,
    fail_reason: reason ? FAIL_MESSAGES[reason] : null,
  };

  const status: AttemptStatus = passed ? "passed" : "failed";
  const attempt: Attempt = {
    id: uid(),
    challenge_id: challenge.id,
    topic_text: challenge.topic_text,
    duration_seconds: durationSeconds,
    transcript,
    overall_score: overall,
    fluency_score: fluency,
    coherence_score: coherence,
    vocabulary_score: vocabulary,
    relevance_score: relevance,
    structure_score: structure,
    filler_count: evaluation.filler_count,
    feedback: evaluation.feedback,
    status,
    created_at: new Date().toISOString(),
  };

  return { attempt, evaluation };
}

function assignTopic(): StartChallengeResponse {
  const usedTexts = new Set(
    mockStore
      .getAttempts()
      .filter((a) => a.status === "passed")
      .map((a) => a.topic_text),
  );
  // Prototype uniqueness: avoid topics this user already passed. The real
  // engine also does semantic matching (spec section 22).
  const pool = FALLBACK_TOPICS.filter((t) => !usedTexts.has(t.text));
  const chosen = pool.length > 0 ? pick(pool) : pick(FALLBACK_TOPICS);

  const challenge: ActiveChallenge = {
    id: uid(),
    user_challenge_id: uid(),
    topic_text: chosen.text,
    category: chosen.category,
    difficulty: 2,
    source_type: "generated",
    assigned_at: new Date().toISOString(),
    status: "assigned",
    max_duration_seconds: MAX_RECORDING_SECONDS,
  };
  mockStore.setActiveChallenge(challenge);
  return { challenge };
}

const auth = {
  async getSession(): Promise<AuthUser | null> {
    return mockStore.getSession();
  },
  async login(email: string, password: string): Promise<AuthUser> {
    await delay(400);
    const user = mockStore.findUser(email);
    if (!user || user.password !== password) {
      throw new Error("Invalid email or password.");
    }
    const session: AuthUser = { id: user.id, email: user.email, display_name: user.display_name };
    mockStore.setSession(session);
    return session;
  },
  async signup(email: string, password: string, displayName: string): Promise<SignupResult> {
    await delay(400);
    if (mockStore.findUser(email)) {
      throw new Error("An account with this email already exists.");
    }
    if (password.length < 8) {
      throw new Error("Password must be at least 8 characters.");
    }
    const user: AuthUser = { id: uid(), email, display_name: displayName || email.split("@")[0]! };
    mockStore.saveUser({ ...user, password });
    mockStore.setSession(user);
    return { user, needs_email_confirmation: false };
  },
  async logout(): Promise<void> {
    mockStore.setSession(null);
  },
};

const challenges = {
  async start(): Promise<StartChallengeResponse> {
    await delay(900); // simulate topic generation latency
    const existing = mockStore.getActiveChallenge();
    // Refresh rule (section 31): keep the active challenge. A failed topic
    // also stays active until passed or explicitly skipped (section 29).
    if (existing && (existing.status === "assigned" || existing.status === "failed")) {
      return { challenge: existing };
    }
    return assignTopic();
  },
  async getCurrent(): Promise<ActiveChallenge | null> {
    return mockStore.getActiveChallenge();
  },
  async submit(
    challengeId: string,
    _audio: Blob,
    durationSeconds: number,
  ): Promise<SubmitChallengeResponse> {
    const active = mockStore.getActiveChallenge();
    if (!active || active.id !== challengeId) {
      throw new Error("No active challenge to submit.");
    }
    await delay(2200); // simulate STT + evaluation pipeline
    const result = mockEvaluate(active, durationSeconds);
    mockStore.saveAttempt(result.attempt);
    if (result.evaluation.passed) {
      mockStore.setActiveChallenge(null); // completed -> history (spec section 30)
    } else {
      active.status = "failed"; // retryable, same topic (spec section 29)
      mockStore.setActiveChallenge(active);
    }
    return result;
  },
  async retry(challengeId: string): Promise<StartChallengeResponse> {
    const active = mockStore.getActiveChallenge();
    if (!active || active.id !== challengeId) {
      throw new Error("Nothing to retry.");
    }
    active.status = "assigned";
    mockStore.setActiveChallenge(active);
    return { challenge: active };
  },
  async skip(challengeId: string): Promise<void> {
    const active = mockStore.getActiveChallenge();
    if (!active || active.id !== challengeId) {
      throw new Error("That is no longer available."); // matches the Worker's 404
    }
    mockStore.setActiveChallenge(null);
  },
};

const profile = {
  async updateDisplayName(displayName: string): Promise<string> {
    const session = mockStore.getSession();
    if (!session) throw new Error("You are not signed in.");

    const trimmed = displayName.trim();
    // Same bounds the Worker enforces, so the mock cannot accept what the real
    // backend would reject.
    if (trimmed.length < 1 || trimmed.length > 60) {
      throw new Error("Your name needs to be between 1 and 60 characters.");
    }

    mockStore.setSession({ ...session, display_name: trimmed });
    const stored = mockStore.findUser(session.email);
    if (stored) mockStore.saveUser({ ...stored, display_name: trimmed });
    return trimmed;
  },

  async deleteAccount(): Promise<void> {
    await delay(300);
    mockStore.clearAll();
  },
};

const progress = {
  async getStats(): Promise<ProgressStats> {
    const attempts = mockStore.getAttempts();
    // localStorage holds the lot, so recent and all-time come from one array.
    return computeProgress(attempts.slice(0, 50), computeTotals(attempts));
  },
  async getHistory(): Promise<HistoryEntry[]> {
    return mockStore.getAttempts();
  },
};

export const mockApi: JessicaApi = { auth, challenges, profile, progress };
