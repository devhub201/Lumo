import { normalizeFault } from "./normalize";
import { faultDiagnostics } from "./diagnostics";
import {
  DEFAULT_RETRY_POLICY,
  type FaultLogger,
  type RetryPolicy,
  type RetryResult,
  type RetrySafety,
} from "./contracts";

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function withRetry<T>(input: {
  operation: (attempt: number) => Promise<T>;
  logger: FaultLogger;
  requestId?: string;
  policy?: Partial<RetryPolicy>;
  retrySafety?: RetrySafety;
}): Promise<RetryResult<T>> {
  const policy = { ...DEFAULT_RETRY_POLICY, ...input.policy };
  const diagnostics = faultDiagnostics(input.logger);
  let attempts = 0;
  let lastFault;
  while (attempts < Math.max(1, policy.maxAttempts)) {
    attempts += 1;
    try {
      const value = await input.operation(attempts);
      if (attempts > 1) diagnostics.recovered(input.requestId);
      return { value, attempts, recovered: attempts > 1 };
    } catch (error) {
      const fault = normalizeFault(error, {
        requestId: input.requestId,
        retrySafety: input.retrySafety,
      });
      lastFault = fault;
      diagnostics.detected(fault, attempts);
      diagnostics.normalized(fault);
      const canRetry =
        fault.retryable &&
        fault.retrySafety !== "not_retryable" &&
        (!input.retrySafety || input.retrySafety !== "not_retryable");
      if (!canRetry || attempts >= policy.maxAttempts) {
        diagnostics.retryExhausted(fault, attempts);
        diagnostics.unrecovered(fault);
        return { fault, attempts, recovered: false };
      }
      const exponential = Math.min(
        policy.maxDelayMs,
        policy.initialDelayMs * policy.backoffMultiplier ** (attempts - 1)
      );
      const jitter = exponential * policy.jitter * (Math.random() * 2 - 1);
      const delayMs = Math.max(0, Math.round(exponential + jitter));
      diagnostics.retryStarted(fault, attempts, delayMs);
      if (delayMs > 0) await delay(delayMs);
      diagnostics.retryCompleted(fault, attempts);
    }
  }
  return { fault: lastFault, attempts, recovered: false };
}
