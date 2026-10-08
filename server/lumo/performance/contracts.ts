import { z } from "zod";
export const performanceStatusSchema = z.enum([
  "success",
  "failure",
  "cancelled",
  "degraded",
]);
export type PerformanceStatus = z.infer<typeof performanceStatusSchema>;
export const performanceMetricSchema = z.object({
  id: z.string().min(1).max(80),
  requestId: z.string().min(1).max(120),
  operation: z.string().min(1).max(100),
  startAt: z.number().finite(),
  endAt: z.number().finite(),
  durationMs: z.number().nonnegative().finite(),
  status: performanceStatusSchema,
  metadata: z
    .record(
      z.string(),
      z.union([z.string().max(200), z.number().finite(), z.boolean()])
    )
    .default({}),
});
export type PerformanceMetric = z.infer<typeof performanceMetricSchema>;
export type PerformanceMetricInput = Omit<
  PerformanceMetric,
  "id" | "endAt" | "durationMs"
> & { endAt?: number };
export type PerformanceSummary = {
  count: number;
  success: number;
  failure: number;
  cancelled: number;
  degraded: number;
  totalDurationMs: number;
  dropped: number;
};
