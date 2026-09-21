import {
  MAX_RECORDING_SECONDS,
  applyPassRules,
  countWords,
  failMessage,
  passRulesFor,
  type Evaluation,
  type SubmitChallengeResponse,
} from "@jessica/types";
import { ProviderError, withRetry, type EvaluationResult } from "@jessica/ai";
import type { RequestContext } from "../types.ts";
import { ApiFailure } from "../utils/failure.ts";

/** A little slack for container overhead vs. the browser's own cut-off. */
const DURATION_TOLERANCE_SECONDS = 10;

const SILENT: EvaluationResult = {
  overall: 0,
  fluency: 0,
  coherence: 0,
  vocabulary: 0,
  relevance: 0,
  structure: 0,
  filler_count: 0,
  feedback: ["We could not hear any speech in that recording."],
};

/**
 * Spec section 48: audio -> Groq Whisper -> transcript -> Gemini -> validated
 * JSON -> backend pass/fail rules -> database.
 *
 * The challenge row is deliberately NOT flipped to 'processing' first. That
 * write only existed to block concurrent submits, and it bought that with a
 * stranded-forever state: a Worker request cancelled mid-pipeline (closed tab,
 * lost connection) never runs its own rollback, and the partial unique index
 * then blocks every start, submit and retry for that user. Concurrent submits
 * are bounded by the hourly rate limit instead, which costs at most one extra
 * attempt and cannot wedge the account.
 */
export async function submitAttempt(
  ctx: RequestContext,
  userId: string,
  challengeId: string,
  audio: ArrayBuffer,
  mimeType: string,
  clientDurationSeconds: number,
  maxDurationSeconds: number,
): Promise<SubmitChallengeResponse> {
  const active = await ctx.repo.getActiveChallenge(userId);
  if (!active || active.id !== challengeId) {
    throw new ApiFailure("not_found", "no matching active challenge");
  }

  // The speaker picks how long they get; the bar moves with it. An unknown
  // value falls back to the strictest rules, so this cannot be gamed downwards.
  const rules = passRulesFor(maxDurationSeconds);

  let providerWorkStarted = false;

  try {
    // --- Phase 5: speech to text -----------------------------------------
    providerWorkStarted = true;
    const transcript = await withRetry(() => ctx.stt.transcribe(audio, mimeType));

    // Prefer the duration measured from the audio. Fall back to the browser's
    // stopwatch only if the provider gave us none, clamped so a client cannot
    // claim its way past the limit.
    const durationSeconds =
      transcript.durationSeconds > 0
        ? transcript.durationSeconds
        : Math.min(Math.max(0, Math.round(clientDurationSeconds)), MAX_RECORDING_SECONDS);

    if (durationSeconds > MAX_RECORDING_SECONDS + DURATION_TOLERANCE_SECONDS) {
      throw new ApiFailure("recording_too_long", `${durationSeconds}s`);
    }

    // --- Phase 6: evaluation ---------------------------------------------
    // Nothing to evaluate means nothing to spend Gemini quota on.
    const evaluation =
      countWords(transcript.text) === 0
        ? SILENT
        : await withRetry(() => ctx.evaluator.evaluate(active.topic_text, transcript.text));

    // --- The backend, not the model, decides (spec sections 38-39) --------
    const { passed, reason } = applyPassRules(
      durationSeconds,
      transcript.text,
      evaluation.relevance,
      rules,
    );

    const attempt = await ctx.repo.insertAttempt({
      user_id: userId,
      challenge_id: active.id,
      duration_seconds: durationSeconds,
      transcript: transcript.text,
      overall_score: evaluation.overall,
      fluency_score: evaluation.fluency,
      coherence_score: evaluation.coherence,
      vocabulary_score: evaluation.vocabulary,
      relevance_score: evaluation.relevance,
      structure_score: evaluation.structure,
      filler_count: evaluation.filler_count,
      feedback: evaluation.feedback,
      status: passed ? "passed" : "failed",
    });

    // Passed -> permanent history; failed -> same topic stays retryable
    // (spec sections 29-30).
    await ctx.repo.setChallengeStatus(active.user_challenge_id, passed ? "passed" : "failed");

    const result: Evaluation = {
      ...evaluation,
      passed,
      fail_reason: reason ? failMessage(reason, rules) : null,
    };
    return { attempt, evaluation: result };
  } catch (error) {
    // The challenge itself is untouched - a provider outage is not a user
    // failure (spec section 78). But the work did consume quota, so it is
    // recorded: this row is what the hourly submit limit counts, and without
    // it a user could burn Whisper capacity for free by failing forever.
    if (providerWorkStarted && (error instanceof ProviderError || error instanceof ApiFailure)) {
      await ctx.repo
        .insertAttempt({
          user_id: userId,
          challenge_id: active.id,
          duration_seconds: 0,
          transcript: "",
          overall_score: null,
          fluency_score: null,
          coherence_score: null,
          vocabulary_score: null,
          relevance_score: null,
          structure_score: null,
          filler_count: null,
          feedback: [],
          status: "processing_error",
        })
        .catch((e: unknown) => console.error("could not record processing_error:", e));
    }
    throw error;
  }
}
