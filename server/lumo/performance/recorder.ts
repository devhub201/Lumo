import { nanoid } from "nanoid";
import {
  performanceMetricSchema,
  type PerformanceMetric,
  type PerformanceMetricInput,
  type PerformanceStatus,
  type PerformanceSummary,
} from "./contracts";
const safeMetadata = (input: Record<string, unknown> = {}) =>
  Object.fromEntries(
    Object.entries(input)
      .filter(
        ([key, value]) =>
          !/(secret|token|password|credential|authorization|content|body|document|email)/i.test(
            key
          ) &&
          (typeof value === "string" ||
            typeof value === "number" ||
            typeof value === "boolean")
      )
      .map(([key, value]) => [
        key,
        typeof value === "string" ? value.slice(0, 200) : value,
      ])
      .slice(0, 12)
  );
export class PerformanceRecorder {
  private readonly metrics: PerformanceMetric[] = [];
  private dropped = 0;
  constructor(private readonly maxMetrics = 500) {}
  record(input: PerformanceMetricInput): PerformanceMetric {
    const endAt = input.endAt ?? Date.now();
    const metric = performanceMetricSchema.parse({
      ...input,
      id: `metric_${nanoid(8)}`,
      endAt,
      durationMs: Math.max(0, endAt - input.startAt),
      metadata: safeMetadata(input.metadata),
    });
    if (this.metrics.length >= this.maxMetrics) {
      this.metrics.shift();
      this.dropped++;
    }
    this.metrics.push(metric);
    return metric;
  }
  measure<T>(
    input: Omit<PerformanceMetricInput, "endAt" | "status"> & {
      status?: PerformanceStatus;
    },
    task: Promise<T> | (() => Promise<T>)
  ): Promise<T> {
    const started = input.startAt ?? Date.now();
    return Promise.resolve(typeof task === "function" ? task() : task).then(
      value => {
        this.record({
          ...input,
          startAt: started,
          status: input.status ?? "success",
        });
        return value;
      },
      error => {
        this.record({ ...input, startAt: started, status: "failure" });
        throw error;
      }
    );
  }
  list(limit = 100) {
    return this.metrics
      .slice(-Math.min(Math.max(limit, 0), 100))
      .map(metric => ({ ...metric, metadata: { ...metric.metadata } }));
  }
  summary(): PerformanceSummary {
    return this.metrics.reduce(
      (summary, metric) => ({
        ...summary,
        count: summary.count + 1,
        success: summary.success + (metric.status === "success" ? 1 : 0),
        failure: summary.failure + (metric.status === "failure" ? 1 : 0),
        cancelled: summary.cancelled + (metric.status === "cancelled" ? 1 : 0),
        degraded: summary.degraded + (metric.status === "degraded" ? 1 : 0),
        totalDurationMs: summary.totalDurationMs + metric.durationMs,
      }),
      {
        count: 0,
        success: 0,
        failure: 0,
        cancelled: 0,
        degraded: 0,
        totalDurationMs: 0,
        dropped: this.dropped,
      }
    );
  }
  clear() {
    this.metrics.length = 0;
    this.dropped = 0;
  }
}
