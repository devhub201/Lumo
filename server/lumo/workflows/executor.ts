import { nanoid } from "nanoid";
import type { LumoToolBoundary } from "../contracts";
import type {
  AgentExecution,
  AgentPlan,
  AgentResult,
  WorkflowStep,
} from "./contracts";
import { agentPlanSchema } from "./contracts";
export const validateAgentPlan = (plan: unknown) =>
  agentPlanSchema.safeParse(plan);
const resolve = (
  value: unknown,
  results: Record<string, { data?: unknown }>
): unknown => {
  if (typeof value === "string") {
    const match = value.match(/^\$([a-zA-Z][\w-]*)\.data(?:\.(.+))?$/);
    if (match) {
      let current = results[match[1]]?.data;
      for (const key of match[2]?.split(".") ?? [])
        current =
          current && typeof current === "object"
            ? (current as Record<string, unknown>)[key]
            : undefined;
      return current;
    }
  }
  if (Array.isArray(value)) return value.map(item => resolve(item, results));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, resolve(item, results)])
    );
  return value;
};
const withTimeout = async <T>(task: Promise<T>, timeoutMs: number) => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      task,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("workflow_timeout")),
          timeoutMs
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};
export class WorkflowExecutor {
  constructor(private readonly tools: LumoToolBoundary) {}
  async execute(
    plan: AgentPlan,
    input: { ownerKey: string; signal?: AbortSignal }
  ): Promise<AgentResult> {
    const startedAt = Date.now();
    const executionId = nanoid(12);
    const steps: AgentExecution["steps"] = {};
    const results: Record<string, { data?: unknown }> = {};
    let state: "completed" | "failed" | "cancelled" | "partial" = "completed";
    let calls = 0;
    if (plan.steps.length > plan.budget.maxSteps) {
      return {
        executionId,
        workflowId: `workflow:${plan.requestId}`,
        requestId: plan.requestId,
        state: "failed",
        steps: {},
        partialResult: false,
        durationMs: Date.now() - startedAt,
      };
    }
    const ordered = [...plan.steps];
    const completed = new Set<string>();
    for (const step of ordered) {
      if (input.signal?.aborted) {
        steps[step.id] = {
          state: "cancelled",
          result: null,
          attempts: 0,
          error: "Workflow cancelled.",
        };
        state = "cancelled";
        break;
      }
      if (
        Date.now() - startedAt > plan.budget.maxExecutionMs ||
        calls >= plan.budget.maxToolCalls
      ) {
        steps[step.id] = {
          state: "cancelled",
          result: null,
          attempts: 0,
          error: "Workflow execution budget exceeded.",
        };
        state = "partial";
        break;
      }
      if (!step.dependsOn.every(id => completed.has(id))) {
        steps[step.id] = {
          state: "failed",
          result: null,
          attempts: 0,
          error: "Workflow dependency was not completed.",
        };
        state = "partial";
        continue;
      }
      const entry: AgentExecution["steps"][string] = {
        state: "running",
        result: null,
        attempts: 0,
      };
      steps[step.id] = entry;
      let result: any = null;
      let error: string | undefined;
      for (let attempt = 0; attempt <= step.retryLimit; attempt++) {
        entry.attempts = attempt + 1;
        calls++;
        try {
          result = await withTimeout(
            this.tools.execute({
              toolId: step.toolId,
              arguments: resolve(step.arguments, results),
              ownerKey: input.ownerKey,
              requestId: plan.requestId,
            }),
            step.timeoutMs
          );
          if (result.success) {
            entry.state = "completed";
            entry.result = result;
            results[step.id] = result;
            completed.add(step.id);
            break;
          }
          error = result.error?.message ?? "Workflow tool failed.";
        } catch (caught) {
          error =
            caught instanceof Error && caught.message === "workflow_timeout"
              ? "Workflow step timed out."
              : "Workflow step failed.";
        }
      }
      if (entry.state !== "completed") {
        entry.state = "failed";
        entry.error = error;
        entry.result = result;
        state = completed.size ? "partial" : "failed";
        break;
      }
    }
    return {
      executionId,
      workflowId: `workflow:${plan.requestId}`,
      requestId: plan.requestId,
      state,
      steps,
      partialResult: state === "partial",
      durationMs: Date.now() - startedAt,
    };
  }
}
export const createWorkflowExecutor = (tools: LumoToolBoundary) =>
  new WorkflowExecutor(tools);
