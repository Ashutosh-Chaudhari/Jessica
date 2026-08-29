import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  ActiveChallenge,
  Attempt,
  AttemptStatus,
  Challenge,
  ChallengeCategory,
  HistoryEntry,
  ProgressRow,
  ProgressTotals,
  SourceType,
  UserChallengeStatus,
} from "@jessica/types";

/**
 * Data access for Jessica (spec section 6: keep the database layer abstract
 * enough to allow migration). Every SQL detail lives behind these functions -
 * the Worker never builds a query itself.
 *
 * Uses the service role key, so RLS does not apply here. Every function that
 * touches user data therefore filters on user_id explicitly.
 */
export type Repository = ReturnType<typeof createRepository>;

export interface UsageRow {
  provider: string;
  model: string;
  request_type: string;
  units: number;
  ok: boolean;
}

export interface NewChallenge {
  topic_text: string;
  topic_key: string;
  category: ChallengeCategory;
  difficulty: 1 | 2 | 3;
  source_type: SourceType;
  embedding: number[] | null;
  expires_at: string | null;
}

export interface NewSource {
  source_url: string;
  source_title: string;
  source_text: string;
  source_type: string;
  published_at: string | null;
  expires_at: string;
}

export interface NewAttempt {
  user_id: string;
  challenge_id: string;
  duration_seconds: number;
  transcript: string;
  overall_score: number | null;
  fluency_score: number | null;
  coherence_score: number | null;
  vocabulary_score: number | null;
  relevance_score: number | null;
  structure_score: number | null;
  filler_count: number | null;
  feedback: string[];
  status: AttemptStatus;
}

export type AssignResult =
  | { ok: true; id: string; assigned_at: string }
  | { ok: false; reason: "already_assigned" | "has_active" };

interface AttemptRow extends Omit<Attempt, "topic_text"> {
  challenges: { topic_text: string } | { topic_text: string }[] | null;
}

/** pgvector accepts its text form; PostgREST will not infer it from a JSON array. */
function toVector(values: number[] | null): string | null {
  return values ? JSON.stringify(values) : null;
}

function topicTextOf(row: AttemptRow): string {
  const c = row.challenges;
  return (Array.isArray(c) ? c[0]?.topic_text : c?.topic_text) ?? "";
}

function unwrap<T>(result: { data: T | null; error: { message: string } | null }, what: string): T {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  if (result.data === null) throw new Error(`${what}: no data`);
  return result.data;
}

export function createRepository(supabaseUrl: string, serviceRoleKey: string) {
  const db: SupabaseClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return {
    /* ------------------------------- profiles ------------------------------ */

    async getProfile(userId: string): Promise<{ display_name: string } | null> {
      const { data, error } = await db
        .from("profiles")
        .select("display_name")
        .eq("id", userId)
        .maybeSingle();
      if (error) throw new Error(`getProfile: ${error.message}`);
      return data;
    },

    async updateDisplayName(userId: string, displayName: string): Promise<void> {
      const { error } = await db
        .from("profiles")
        .update({ display_name: displayName, updated_at: new Date().toISOString() })
        .eq("id", userId);
      if (error) throw new Error(`updateDisplayName: ${error.message}`);
    },

    /**
     * Claims the right to announce a new user, exactly once.
     *
     * The conditional UPDATE is the whole mechanism: only one caller can ever
     * match `notified_at is null`, so concurrent requests cannot both send a
     * notification. Returns the profile on the first call and null forever
     * after, which means the caller needs no locking or bookkeeping.
     */
    async claimNewUserNotification(userId: string): Promise<{ display_name: string } | null> {
      const { data, error } = await db
        .from("profiles")
        .update({ notified_at: new Date().toISOString() })
        .eq("id", userId)
        .is("notified_at", null)
        .select("display_name")
        .maybeSingle();
      if (error) {
        // Never fail a user's request over a notification.
        console.error("claimNewUserNotification:", error.message);
        return null;
      }
      return data as { display_name: string } | null;
    },

    /** Headline numbers, so each notification doubles as a status report. */
    async siteSnapshot(): Promise<{ users: number; attemptsToday: number; callsToday: number }> {
      const startOfDay = new Date();
      startOfDay.setUTCHours(0, 0, 0, 0);
      const since = startOfDay.toISOString();

      const [users, attempts, calls] = await Promise.all([
        db.from("profiles").select("id", { count: "exact", head: true }),
        db.from("attempts").select("id", { count: "exact", head: true }).gte("created_at", since),
        db.from("ai_usage").select("id", { count: "exact", head: true }).gte("created_at", since),
      ]);

      return {
        users: users.count ?? 0,
        attemptsToday: attempts.count ?? 0,
        callsToday: calls.count ?? 0,
      };
    },

    /* ------------------------------ challenges ----------------------------- */

    /** The one live challenge, if any (spec section 31). */
    async getActiveChallenge(userId: string): Promise<ActiveChallenge | null> {
      const { data, error } = await db
        .from("user_challenges")
        .select("id, status, assigned_at, challenges(id, topic_text, category, difficulty, source_type)")
        .eq("user_id", userId)
        .in("status", ["assigned", "processing", "failed"])
        .maybeSingle();
      if (error) throw new Error(`getActiveChallenge: ${error.message}`);
      if (!data) return null;

      const row = data as unknown as {
        id: string;
        status: UserChallengeStatus;
        assigned_at: string;
        challenges: Challenge | Challenge[] | null;
      };
      const challenge = Array.isArray(row.challenges) ? row.challenges[0] : row.challenges;
      if (!challenge) return null;

      return {
        ...challenge,
        user_challenge_id: row.id,
        status: row.status,
        assigned_at: row.assigned_at,
        max_duration_seconds: 0, // filled in by the caller from shared config
      };
    },

    /** Spec sections 64-65: spend nothing if the pool already has something. */
    async pickUnseenChallenge(
      userId: string,
      category: ChallengeCategory | null,
      maxSimilarity: number,
    ): Promise<Challenge | null> {
      const { data, error } = await db.rpc("pick_unseen_challenge", {
        p_user_id: userId,
        p_category: category,
        p_max_similarity: maxSimilarity,
      });
      if (error) throw new Error(`pickUnseenChallenge: ${error.message}`);
      const row = (data ?? [])[0] as (Challenge & Record<string, unknown>) | undefined;
      if (!row) return null;
      // The RPC returns the whole table row. Project it here so the embedding,
      // topic_key and expiry never reach the Worker's response.
      return {
        id: row.id,
        topic_text: row.topic_text,
        category: row.category,
        difficulty: row.difficulty,
        source_type: row.source_type,
      };
    },

    /** Spec sections 22-23: exact key match or semantic neighbour of a pass. */
    async isDuplicateForUser(
      userId: string,
      topicKey: string,
      embedding: number[] | null,
      maxSimilarity: number,
    ): Promise<boolean> {
      const { data, error } = await db.rpc("is_duplicate_for_user", {
        p_user_id: userId,
        p_topic_key: topicKey,
        p_embedding: toVector(embedding),
        p_max_similarity: maxSimilarity,
      });
      if (error) throw new Error(`isDuplicateForUser: ${error.message}`);
      return data === true;
    },

    /**
     * Inserts into the shared pool, or returns the existing row when another
     * user already generated the same topic (spec section 65).
     */
    async upsertChallenge(challenge: NewChallenge): Promise<Challenge> {
      // Omit the embedding entirely when we have none, rather than upserting
      // NULL over an embedding a previous (successful) generation stored.
      const { embedding, ...rest } = challenge;
      const payload = embedding ? { ...rest, embedding: toVector(embedding) } : rest;

      const { data, error } = await db
        .from("challenges")
        .upsert(payload, {
          onConflict: "topic_key",
          ignoreDuplicates: false,
        })
        .select("id, topic_text, category, difficulty, source_type")
        .single();
      if (error) throw new Error(`upsertChallenge: ${error.message}`);
      return data as unknown as Challenge;
    },

    /**
     * Both uniqueness rules on user_challenges are normal outcomes, not errors:
     *   already_assigned - this user has seen this topic; try another
     *   has_active       - a concurrent request won the race and assigned one
     * React StrictMode alone fires the second case on every dev page load.
     */
    async assignChallenge(
      userId: string,
      challengeId: string,
    ): Promise<AssignResult> {
      const { data, error } = await db
        .from("user_challenges")
        .insert({ user_id: userId, challenge_id: challengeId })
        .select("id, assigned_at")
        .single();

      if (error) {
        if (error.code === "23505") {
          const conflict = `${error.message} ${error.details ?? ""}`;
          return { ok: false, reason: conflict.includes("one_active") ? "has_active" : "already_assigned" };
        }
        throw new Error(`assignChallenge: ${error.message}`);
      }
      const row = data as unknown as { id: string; assigned_at: string };
      return { ok: true, ...row };
    },

    /**
     * Attach an embedding to a challenge that was stored without one. Only
     * fills a gap - never overwrites an embedding that is already there.
     */
    async setChallengeEmbedding(challengeId: string, embedding: number[]): Promise<void> {
      const { error } = await db
        .from("challenges")
        .update({ embedding: toVector(embedding) })
        .eq("id", challengeId)
        .is("embedding", null);
      if (error) console.error("setChallengeEmbedding failed:", error.message);
    },

    async setChallengeStatus(
      userChallengeId: string,
      status: UserChallengeStatus,
    ): Promise<void> {
      const { error } = await db
        .from("user_challenges")
        .update({
          status,
          completed_at: status === "passed" || status === "skipped" ? new Date().toISOString() : null,
        })
        .eq("id", userChallengeId);
      if (error) throw new Error(`setChallengeStatus: ${error.message}`);
    },

    /** Topic texts to steer the generator away from (spec section 16). */
    async recentPassedTopics(userId: string, limit: number): Promise<string[]> {
      const { data, error } = await db
        .from("user_challenges")
        .select("completed_at, challenges(topic_text)")
        .eq("user_id", userId)
        .eq("status", "passed")
        .order("completed_at", { ascending: false })
        .limit(limit);
      if (error) throw new Error(`recentPassedTopics: ${error.message}`);
      return ((data ?? []) as unknown as { challenges: { topic_text: string } | null }[])
        .map((r) => r.challenges?.topic_text)
        .filter((t): t is string => Boolean(t));
    },

    /* ------------------------------- attempts ------------------------------ */

    async insertAttempt(attempt: NewAttempt): Promise<Attempt> {
      const result = await db
        .from("attempts")
        .insert(attempt)
        .select("*, challenges(topic_text)")
        .single();
      const row = unwrap(result, "insertAttempt") as unknown as AttemptRow;
      return { ...toAttempt(row) };
    },

    async listAttempts(userId: string, limit = 100): Promise<HistoryEntry[]> {
      const { data, error } = await db
        .from("attempts")
        .select("*, challenges(topic_text)")
        .eq("user_id", userId)
        .neq("status", "processing_error") // provider failures are not the user's history
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw new Error(`listAttempts: ${error.message}`);
      return ((data ?? []) as unknown as AttemptRow[]).map(toAttempt);
    },

    async getAttempt(userId: string, attemptId: string): Promise<Attempt | null> {
      const { data, error } = await db
        .from("attempts")
        .select("*, challenges(topic_text)")
        .eq("user_id", userId)
        .eq("id", attemptId)
        .maybeSingle();
      if (error) throw new Error(`getAttempt: ${error.message}`);
      return data ? toAttempt(data as unknown as AttemptRow) : null;
    },

    /**
     * Only the recent window. The one thing that needs individual rows is the
     * per-dimension trend; every all-time figure comes from progressTotals(),
     * which counts server-side and so has no row ceiling to silently drop the
     * oldest history behind.
     */
    async progressRows(userId: string, limit = 50): Promise<ProgressRow[]> {
      const { data, error } = await db
        .from("attempts")
        .select(
          "created_at, challenge_id, duration_seconds, status, overall_score, fluency_score, coherence_score, vocabulary_score, relevance_score, structure_score",
        )
        .eq("user_id", userId)
        .neq("status", "processing_error")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw new Error(`progressRows: ${error.message}`);
      return (data ?? []) as unknown as ProgressRow[];
    },

    /** Counted over the user's whole history (spec sections 42, 79-80). */
    async progressTotals(userId: string): Promise<ProgressTotals> {
      const { data, error } = await db.rpc("user_progress_totals", { p_user_id: userId });
      if (error) throw new Error(`progressTotals: ${error.message}`);

      // Postgres bigint arrives as a string over PostgREST; coerce every field.
      const row = (data ?? [])[0] as Record<string, unknown> | undefined;
      const n = (key: string) => Number(row?.[key] ?? 0);
      return {
        total_attempts: n("total_attempts"),
        topics_attempted: n("topics_attempted"),
        topics_passed: n("topics_passed"),
        topics_retried: n("topics_retried"),
        speaking_seconds: n("speaking_seconds"),
        average_score: n("average_score"),
        best_score: n("best_score"),
        current_streak_days: n("current_streak_days"),
        longest_streak_days: n("longest_streak_days"),
      };
    },

    /* ----------------------------- rate limiting ---------------------------- */

    /** Spec section 55. Counts rows rather than needing separate rate-limit storage. */
    async countSince(
      table: "user_challenges" | "attempts",
      userId: string,
      sinceIso: string,
    ): Promise<number> {
      const column = table === "user_challenges" ? "assigned_at" : "created_at";
      const { count, error } = await db
        .from(table)
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte(column, sinceIso);
      if (error) throw new Error(`countSince(${table}): ${error.message}`);
      return count ?? 0;
    },

    /* ---------------------------- current topics ---------------------------- */

    /** Level 2 of the topic strategy: what we already fetched and is still fresh. */
    async getFreshSources(limit: number): Promise<{ source_title: string }[]> {
      const { data, error } = await db
        .from("topic_sources")
        .select("source_title")
        .gt("expires_at", new Date().toISOString())
        .order("published_at", { ascending: false, nullsFirst: false })
        .limit(limit);
      if (error) throw new Error(`getFreshSources: ${error.message}`);
      return (data ?? []) as unknown as { source_title: string }[];
    },

    /**
     * Level 3: cache what we just retrieved. Re-fetching the same feed returns
     * the same URLs, so this upserts and refreshes the expiry rather than
     * growing a duplicate row per fetch.
     */
    async saveSources(items: NewSource[]): Promise<void> {
      if (items.length === 0) return;
      const { error } = await db
        .from("topic_sources")
        .upsert(items, { onConflict: "source_url", ignoreDuplicates: false });
      if (error) console.error("saveSources failed:", error.message);
    },

    /** Spec section 68: expired current information is not current information. */
    async purgeExpiredSources(): Promise<void> {
      const { error } = await db
        .from("topic_sources")
        .delete()
        .lt("expires_at", new Date().toISOString());
      if (error) console.error("purgeExpiredSources failed:", error.message);
    },

    /* -------------------------------- usage -------------------------------- */

    /**
     * Every provider call made since `sinceIso`, across all users. This is the
     * number the global daily budget is enforced against.
     */
    async countUsageSince(sinceIso: string): Promise<number> {
      const { count, error } = await db
        .from("ai_usage")
        .select("id", { count: "exact", head: true })
        .gte("created_at", sinceIso);
      if (error) throw new Error(`countUsageSince: ${error.message}`);
      return count ?? 0;
    },

    /** Spec section 56. Best-effort: quota bookkeeping must never fail a request. */
    async logUsage(userId: string | null, rows: UsageRow[]): Promise<void> {
      if (rows.length === 0) return;
      const { error } = await db.from("ai_usage").insert(rows.map((r) => ({ ...r, user_id: userId })));
      if (error) console.error("logUsage failed:", error.message);
    },

    /* ------------------------------- account ------------------------------- */

    /** Spec section 61. */
    async deleteAccount(userId: string): Promise<void> {
      const { error } = await db.rpc("delete_account", { p_user_id: userId });
      if (error) throw new Error(`deleteAccount: ${error.message}`);
    },
  };
}

function toAttempt(row: AttemptRow): Attempt {
  return {
    id: row.id,
    challenge_id: row.challenge_id,
    topic_text: topicTextOf(row),
    duration_seconds: row.duration_seconds,
    transcript: row.transcript,
    overall_score: row.overall_score,
    fluency_score: row.fluency_score,
    coherence_score: row.coherence_score,
    vocabulary_score: row.vocabulary_score,
    relevance_score: row.relevance_score,
    structure_score: row.structure_score,
    filler_count: row.filler_count,
    feedback: Array.isArray(row.feedback) ? row.feedback : [],
    status: row.status,
    created_at: row.created_at,
  };
}
