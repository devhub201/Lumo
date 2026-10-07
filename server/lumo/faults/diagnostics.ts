import type { FaultLogger, LumoFault } from "./contracts";

export const faultDiagnostics = (logger: FaultLogger) => ({
  detected: (fault: LumoFault, attempt?: number) =>
    logger.warn("error.detected", safe(fault, attempt)),
  normalized: (fault: LumoFault) =>
    logger.warn("error.normalized", safe(fault)),
  retryStarted: (fault: LumoFault, attempt: number, delayMs: number) =>
    logger.info("error.retry.started", { ...safe(fault, attempt), delayMs }),
  retryCompleted: (fault: LumoFault, attempt: number) =>
    logger.info("error.retry.completed", safe(fault, attempt)),
  retryExhausted: (fault: LumoFault, attempts: number) =>
    logger.error("error.retry.exhausted", { ...safe(fault), attempts }),
  fallbackUsed: (fault: LumoFault) =>
    logger.warn("error.fallback.used", safe(fault)),
  recovered: (requestId?: string) =>
    logger.info("error.recovered", { requestId }),
  unrecovered: (fault: LumoFault) =>
    logger.error("error.unrecovered", safe(fault)),
});

const safe = (fault: LumoFault, attempt?: number) => ({
  requestId: fault.requestId,
  errorCode: fault.code,
  category: fault.category,
  severity: fault.severity,
  retryable: fault.retryable,
  retrySafety: fault.retrySafety,
  ...(attempt ? { attempt } : {}),
});
