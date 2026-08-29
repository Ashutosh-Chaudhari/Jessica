import type { Context } from "hono";
import { API_ERROR_MESSAGES, type ApiErrorCode } from "@jessica/types";
import { ProviderError } from "@jessica/ai";
import { ApiFailure } from "./failure.ts";

const STATUS: Record<ApiErrorCode, number> = {
  unauthorized: 401,
  not_found: 404,
  rate_limited: 429,
  invalid_request: 400,
  audio_too_large: 413,
  recording_too_long: 400,
  provider_unavailable: 503,
  internal: 500,
};

/**
 * The only way this API reports a problem. Provider text never reaches the
 * user (spec section 60) - it goes to the Worker log instead.
 */
export function fail(c: Context, code: ApiErrorCode, logDetail?: unknown) {
  if (logDetail) console.error(`[${code}]`, logDetail);
  return c.json({ error: code, message: API_ERROR_MESSAGES[code] }, STATUS[code] as 400);
}

/**
 * Spec section 78: a provider being down is a system failure, not a user
 * failure, and must not be reported as if the speaker did something wrong.
 */
export function failFromError(c: Context, error: unknown) {
  if (error instanceof ApiFailure) return fail(c, error.code, error.message);
  if (error instanceof ProviderError) return fail(c, "provider_unavailable", error.message);
  return fail(c, "internal", error);
}
