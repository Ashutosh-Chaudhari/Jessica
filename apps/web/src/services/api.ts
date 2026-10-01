import type {
  ActiveChallenge,
  AuthUser,
  ChallengeCategory,
  HistoryEntry,
  ProgressStats,
  SignupResult,
  StartChallengeResponse,
  SubmitChallengeResponse,
} from "@jessica/types";

export interface AuthService {
  getSession(): Promise<AuthUser | null>;
  login(email: string, password: string): Promise<AuthUser>;
  signup(email: string, password: string, displayName: string): Promise<SignupResult>;
  logout(): Promise<void>;
}

export interface ChallengeService {
  /**
   * Returns the active challenge if one exists, otherwise generates a new one.
   * `category` is a preference for the new topic and is ignored when something
   * is already live - to change subject, skip first.
   */
  start(category?: ChallengeCategory): Promise<StartChallengeResponse>;
  getCurrent(): Promise<ActiveChallenge | null>;
  submit(
    challengeId: string,
    audio: Blob,
    durationSeconds: number,
    /** The length the speaker chose; the pass rules scale with it. */
    maxDurationSeconds: number,
  ): Promise<SubmitChallengeResponse>;
  /** Re-assigns the same topic after a failed attempt (spec section 29). */
  retry(challengeId: string): Promise<StartChallengeResponse>;
  /** Abandons the topic so the next start generates a different one. */
  skip(challengeId: string): Promise<void>;
  /** Fire-and-forget: records that the microphone was opened for this topic. */
  markStarted(challengeId: string): Promise<void>;
}

export interface ProfileService {
  /** Returns the stored name, which may differ from what was typed (trimmed). */
  updateDisplayName(displayName: string): Promise<string>;
  /** Removes the account and everything attached to it (spec section 61). */
  deleteAccount(): Promise<void>;
}

export interface ProgressService {
  getStats(): Promise<ProgressStats>;
  getHistory(): Promise<HistoryEntry[]>;
}

export interface JessicaApi {
  auth: AuthService;
  challenges: ChallengeService;
  profile: ProfileService;
  progress: ProgressService;
}
