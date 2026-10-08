export const PERFORMANCE_LIMITS = {
  maxRequestChars: 4000,
  maxContextChars: 24000,
  maxToolResultChars: 12000,
  maxWorkflowSteps: 20,
  maxToolCalls: 30,
  maxRuntimeOutputChars: 4000,
  maxBrowserChars: 12000,
  maxFileChars: 1_000_000,
  maxCodingOperations: 100,
  maxConcurrentOperations: 4,
  maxTelemetryMetrics: 500,
} as const;
export const boundedText = (value: string, max: number) => ({
  value: value.length > max ? value.slice(0, max) : value,
  truncated: value.length > max,
});
export class ConcurrencyGate {
  private active = 0;
  constructor(private readonly max: number) {}
  async run<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) throw new Error("cancelled");
    while (this.active >= this.max) {
      await new Promise(resolve => setTimeout(resolve, 1));
      if (signal?.aborted) throw new Error("cancelled");
    }
    this.active++;
    try {
      return await task();
    } finally {
      this.active--;
    }
  }
  get activeCount() {
    return this.active;
  }
}
