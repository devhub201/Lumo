import { toSafePublicFault } from "./faults/normalize";

export type LumoErrorCode =
  | "invalid_input"
  | "database_unavailable"
  | "conversation_not_found"
  | "provider_not_configured"
  | "provider_timeout"
  | "provider_failed"
  | "empty_provider_response"
  | "unexpected";

export class LumoError extends Error {
  constructor(
    public readonly code: LumoErrorCode,
    message: string,
    public readonly userMessage: string,
    public readonly retryable = false,
    options?: { cause?: unknown }
  ) {
    super(message, options);
    this.name = "LumoError";
  }
}

export function toPublicError(error: unknown) {
  return toSafePublicFault(error);
}
