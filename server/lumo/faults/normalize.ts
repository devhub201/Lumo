import { ZodError } from "zod";
import type {
  FaultCategory,
  FaultSeverity,
  LumoFault,
  RetrySafety,
} from "./contracts";

type NormalizationInput = {
  requestId?: string;
  category?: FaultCategory;
  code?: string;
  retryable?: boolean;
  retrySafety?: RetrySafety;
  userMessage?: string;
  metadata?: Record<string, unknown>;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const faultCategory = (error: unknown): FaultCategory => {
  if (error instanceof ZodError) return "validation";
  const code =
    isRecord(error) && typeof error.code === "string"
      ? error.code.toLowerCase()
      : "";
  const status =
    isRecord(error) && typeof error.status === "number"
      ? error.status
      : undefined;
  const message =
    error instanceof Error
      ? error.message.toLowerCase()
      : String(error).toLowerCase();
  if (code.includes("invalid") || code.includes("validation"))
    return "validation";
  if (code.includes("auth")) return "authentication";
  if (code.includes("permission") || code.includes("forbidden"))
    return "authorization";
  if (code.includes("timeout") || message.includes("timed out"))
    return "timeout";
  if (code.includes("network") || code.includes("connection")) return "network";
  if (
    code.includes("rate") ||
    code.includes("limit") ||
    status === 429 ||
    message.includes("429")
  )
    return "rate_limit";
  if (code.includes("provider")) return "provider";
  if (code.includes("model")) return "model";
  if (code.includes("memory")) return "memory";
  if (code.includes("context")) return "context";
  if (code.includes("tool")) return "tool";
  if (code.includes("database") || code.includes("db")) return "database";
  if (code.includes("persist") || code.includes("conversation"))
    return "persistence";
  if (code.includes("config")) return "configuration";
  if (
    message.includes("network") ||
    message.includes("fetch") ||
    message.includes("econn")
  )
    return "network";
  if (message.includes("database") || message.includes("mysql"))
    return "database";
  return "unknown";
};

const severityFor = (
  category: FaultCategory,
  retryable: boolean
): FaultSeverity => {
  if (category === "validation" || category === "authorization")
    return "warning";
  if (category === "configuration") return "critical";
  if (category === "unknown") return "error";
  return retryable ? "warning" : "error";
};

const retrySafetyFor = (
  category: FaultCategory,
  retryable: boolean
): RetrySafety => {
  if (
    !retryable ||
    ["validation", "authentication", "authorization", "configuration"].includes(
      category
    )
  )
    return "not_retryable";
  if (["database", "persistence", "tool"].includes(category))
    return "conditionally_retryable";
  return "safe_to_retry";
};

const safeMessageFor = (category: FaultCategory) => {
  switch (category) {
    case "validation":
      return "Please check the request and try again.";
    case "authorization":
      return "I need the required permission before I can do that.";
    case "provider":
    case "model":
      return "I'm having trouble reaching the AI service right now.";
    case "tool":
      return "I couldn't complete that operation right now.";
    case "timeout":
    case "network":
    case "rate_limit":
      return "I hit a temporary problem while processing that. Try again.";
    case "database":
    case "persistence":
      return "LUMO could not complete that request because it could not be saved reliably. Your message is still available to retry.";
    case "context":
      return "I had trouble preparing the conversation context, so I continued with a minimal request.";
    default:
      return "I couldn't complete that right now. Please try again.";
  }
};

export const normalizeFault = (
  error: unknown,
  input: NormalizationInput = {}
): LumoFault => {
  const category = input.category ?? faultCategory(error);
  const record = isRecord(error) ? error : undefined;
  const code =
    input.code ??
    (record && typeof record.code === "string" ? record.code : "unexpected");
  const retryable =
    input.retryable ??
    (record && typeof record.retryable === "boolean" ? record.retryable : true);
  const internalMessage =
    error instanceof Error ? error.message : String(error);
  const userMessage =
    input.userMessage ??
    (record && typeof record.userMessage === "string"
      ? record.userMessage
      : safeMessageFor(category));
  const retrySafety = input.retrySafety ?? retrySafetyFor(category, retryable);
  return {
    code,
    category,
    severity: severityFor(category, retryable),
    retryable,
    retrySafety,
    internalMessage,
    userMessage,
    metadata: input.metadata ?? {},
    requestId: input.requestId,
  };
};

export const toSafePublicFault = (error: unknown, requestId?: string) => {
  const fault = normalizeFault(error, { requestId });
  return {
    code: fault.code,
    message: fault.userMessage,
    retryable: fault.retryable,
    ...(fault.requestId ? { requestId: fault.requestId } : {}),
  };
};
