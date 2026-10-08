import { describe, expect, it } from "vitest";
import {
  PerformanceRecorder,
  ScopedCache,
  ConcurrencyGate,
} from "./performance";
import { WorkflowExecutor } from "./workflows/executor";

describe("Phase 26 bounded performance layer", () => {
  it("bounds telemetry, sanitizes secrets/content, and summarizes outcomes", () => {
    const recorder = new PerformanceRecorder(2);
    recorder.record({
      requestId: "r1",
      operation: "test",
      startAt: 1,
      endAt: 4,
      status: "success",
      metadata: { token: "secret", content: "private", safe: "ok" },
    });
    recorder.record({
      requestId: "r1",
      operation: "test2",
      startAt: 2,
      endAt: 8,
      status: "failure",
      metadata: { safe: true },
    });
    recorder.record({
      requestId: "r1",
      operation: "test3",
      startAt: 3,
      endAt: 9,
      status: "cancelled",
      metadata: {},
    });
    expect(recorder.list(10)).toHaveLength(2);
    expect(
      recorder
        .list(10)
        .every(
          metric =>
            !Object.keys(metric.metadata).some(k => /token|content/i.test(k))
        )
    ).toBe(true);
    expect(recorder.summary()).toMatchObject({
      count: 2,
      failure: 1,
      cancelled: 1,
      dropped: 1,
    });
  });
  it("scopes cache entries by owner and bounds entry count", () => {
    const cache = new ScopedCache<string>(2, 1000);
    cache.set("peter", "catalog", "same", "peter-value");
    cache.set("other", "catalog", "same", "other-value");
    expect(cache.get("peter", "catalog", "same")).toBe("peter-value");
    expect(cache.get("other", "catalog", "same")).toBe("other-value");
    cache.set("peter", "catalog", "new", "new-value");
    expect(cache.size).toBe(2);
  });
  it("keeps concurrent work bounded and propagates cancellation", async () => {
    const gate = new ConcurrencyGate(2);
    let active = 0;
    let peak = 0;
    const job = () =>
      gate.run(async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise(resolve => setTimeout(resolve, 5));
        active--;
        return true;
      });
    await Promise.all(Array.from({ length: 12 }, job));
    expect(peak).toBeLessThanOrEqual(2);
    const controller = new AbortController();
    controller.abort();
    await expect(gate.run(async () => true, controller.signal)).rejects.toThrow(
      "cancelled"
    );
  });
});

describe("Phase 27 workflow stress boundaries", () => {
  it("records bounded workflow metrics and returns partial results on failure", async () => {
    const recorder = new PerformanceRecorder();
    let calls = 0;
    const executor = new WorkflowExecutor(
      {
        execute: async input => {
          calls++;
          return {
            success: input.toolId !== "bad",
            toolId: input.toolId,
            data: null,
            error:
              input.toolId === "bad"
                ? {
                    code: "execution_failed",
                    message: "failed",
                    retryable: false,
                  }
                : null,
            metadata: { requestId: input.requestId, durationMs: 1 },
          };
        },
        listTools: () => [],
      },
      recorder
    );
    const result = await executor.execute(
      {
        requestId: "workflow-stress",
        steps: [
          {
            id: "one",
            toolId: "ok",
            arguments: {},
            dependsOn: [],
            retryLimit: 0,
            timeoutMs: 100,
          },
          {
            id: "two",
            toolId: "bad",
            arguments: {},
            dependsOn: ["one"],
            retryLimit: 1,
            timeoutMs: 100,
          },
        ],
        budget: { maxSteps: 2, maxToolCalls: 3, maxExecutionMs: 1000 },
      },
      { ownerKey: "peter" }
    );
    expect(result.state).toBe("partial");
    expect(calls).toBe(3);
    expect(recorder.summary().count).toBe(1);
  });
});
