import type { ActiveChallenge, Attempt, AuthUser } from "@jessica/types";

const KEYS = {
  users: "jessica.mock.users",
  session: "jessica.mock.session",
  active: "jessica.mock.activeChallenge",
  attempts: "jessica.mock.attempts",
} as const;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
}

interface MockUser extends AuthUser {
  password: string;
}

export const mockStore = {
  getUsers(): MockUser[] {
    return read<MockUser[]>(KEYS.users, []);
  },
  saveUser(user: MockUser): void {
    const users = this.getUsers().filter((u) => u.id !== user.id);
    users.push(user);
    write(KEYS.users, users);
  },
  findUser(email: string): MockUser | undefined {
    return this.getUsers().find((u) => u.email.toLowerCase() === email.toLowerCase());
  },

  getSession(): AuthUser | null {
    return read<AuthUser | null>(KEYS.session, null);
  },
  setSession(user: AuthUser | null): void {
    if (user) write(KEYS.session, user);
    else localStorage.removeItem(KEYS.session);
  },

  getActiveChallenge(): ActiveChallenge | null {
    return read<ActiveChallenge | null>(KEYS.active, null);
  },
  setActiveChallenge(challenge: ActiveChallenge | null): void {
    if (challenge) write(KEYS.active, challenge);
    else localStorage.removeItem(KEYS.active);
  },

  getAttempts(): Attempt[] {
    return read<Attempt[]>(KEYS.attempts, []);
  },
  saveAttempt(attempt: Attempt): void {
    const attempts = this.getAttempts().filter((a) => a.id !== attempt.id);
    attempts.push(attempt);
    attempts.sort((a, b) => b.created_at.localeCompare(a.created_at));
    write(KEYS.attempts, attempts);
  },
  getAttempt(id: string): Attempt | undefined {
    return this.getAttempts().find((a) => a.id === id);
  },

  clearAll(): void {
    Object.values(KEYS).forEach((k) => localStorage.removeItem(k));
  },
};
