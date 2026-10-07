export type FaultCategory =
  | "validation"
  | "authentication"
  | "authorization"
  | "network"
  | "timeout"
  | "rate_limit"
  | "provider"
  | "model"
  | "memory"
  | "context"
  | "tool"
  | "database"
  | "persistence"
  | "configuration"
  | "internal"
  | "unknown";

export type FaultSeverity = "info" | "warning" | "error" | "critical";
export type RetrySafety =
  | "safe_to_retry"
  | "conditionally_retryable"
  | "not_retryable";

export type LumoFault = {
  code: string;
  category: FaultCategory;
  severity: FaultSeverity;
  retryable: boolean;
  retrySafety: RetrySafety;
  internalMessage: string;
  userMessage: string;
  metadata: Record<string, unknown>;
  requestId?: string;
};

export type RetryPolicy = {
  maxAttempts: number;
  initialDelayMs: number;
  backoffMultiplier: number;
  maxDelayMs: number;
  jitter: number;
  retrySafety?: RetrySafety;
};

export type RetryResult<T> = {
  value?: T;
  fault?: LumoFault;
  attempts: number;
  recovered: boolean;
};

export type FallbackResult<T> = {
  value: T;
  usedFallback: boolean;
  fault?: LumoFault;
};

export type FaultLogger = {
  info(event: string, fields?: Record<string, unknown>): void;
  warn(event: string, fields?: Record<string, unknown>): void;
  error(event: string, fields?: Record<string, unknown>): void;
};

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  initialDelayMs: 250,
  backoffMultiplier: 2,
  maxDelayMs: 4000,
  jitter: 0.15,
  retrySafety: "safe_to_retry",
};
