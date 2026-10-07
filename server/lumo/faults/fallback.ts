import { faultDiagnostics } from "./diagnostics";
import { normalizeFault } from "./normalize";
import type { FaultLogger, FallbackResult } from "./contracts";

export async function withFallback<T>(input: {
  primary: () => Promise<T>;
  fallback: (fault: ReturnType<typeof normalizeFault>) => Promise<T> | T;
  logger: FaultLogger;
  requestId?: string;
}): Promise<FallbackResult<T>> {
  try {
    return { value: await input.primary(), usedFallback: false };
  } catch (error) {
    const fault = normalizeFault(error, { requestId: input.requestId });
    const diagnostics = faultDiagnostics(input.logger);
    diagnostics.detected(fault);
    diagnostics.normalized(fault);
    const value = await input.fallback(fault);
    diagnostics.fallbackUsed(fault);
    return { value, usedFallback: true, fault };
  }
}
