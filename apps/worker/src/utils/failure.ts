import type { ApiErrorCode } from "@jessica/types";

/** A deliberate, user-safe failure. Anything else is an unexpected bug. */
export class ApiFailure extends Error {
  readonly code: ApiErrorCode;

  // Plain field, not a parameter property - see ProviderError in @jessica/ai.
  constructor(code: ApiErrorCode, detail?: string) {
    super(detail ?? code);
    this.name = "ApiFailure";
    this.code = code;
  }
}
