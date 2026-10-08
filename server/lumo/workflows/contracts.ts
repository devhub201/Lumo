import { z } from "zod";
export const workflowStateSchema = z.enum([
  "planned",
  "running",
  "completed",
  "failed",
  "cancelled",
  "partial",
]);
export type WorkflowState = z.infer<typeof workflowStateSchema>;
export const workflowStepStateSchema = z.enum([
  "pending",
  "running",
  "completed",
  "failed",
  "skipped",
  "cancelled",
]);
export type WorkflowStepState = z.infer<typeof workflowStepStateSchema>;
export const workflowStepSchema = z.object({
  id: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/),
  toolId: z.string().min(1).max(100),
  arguments: z.unknown(),
  dependsOn: z.array(z.string().max(64)).max(8).default([]),
  retryLimit: z.number().int().min(0).max(3).default(0),
  timeoutMs: z.number().int().min(50).max(30000).default(10000),
});
export type WorkflowStep = z.infer<typeof workflowStepSchema>;
export const workflowBudgetSchema = z.object({
  maxSteps: z.number().int().min(1).max(20),
  maxToolCalls: z.number().int().min(1).max(30),
  maxExecutionMs: z.number().int().min(100).max(60000),
  maxContextChars: z.number().int().min(100).max(16000),
});
export type WorkflowBudget = z.infer<typeof workflowBudgetSchema>;
export const agentPlanSchema = z
  .object({
    requestId: z.string().min(1).max(80),
    objective: z.string().min(1).max(1000),
    steps: z.array(workflowStepSchema).min(1).max(20),
    budget: workflowBudgetSchema,
    requiredPermissions: z.array(z.string().max(50)).max(20),
    status: z.enum([
      "validated",
      "clarification_required",
      "unsupported_request",
    ]),
  })
  .superRefine((plan, ctx) => {
    const ids = new Set<string>();
    for (const step of plan.steps) {
      if (ids.has(step.id))
        ctx.addIssue({ code: "custom", message: "duplicate workflow step id" });
      ids.add(step.id);
      for (const dep of step.dependsOn) {
        if (!plan.steps.some(candidate => candidate.id === dep))
          ctx.addIssue({
            code: "custom",
            message: `unknown dependency ${dep}`,
          });
        if (step.id === dep)
          ctx.addIssue({
            code: "custom",
            message: "recursive workflow dependency",
          });
      }
    }
    const byId = new Map(plan.steps.map(step => [step.id, step]));
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const visit = (id: string) => {
      if (visiting.has(id)) return true;
      if (visited.has(id)) return false;
      visiting.add(id);
      const cycle = (byId.get(id)?.dependsOn ?? []).some(visit);
      visiting.delete(id);
      visited.add(id);
      return cycle;
    };
    if (plan.steps.some(step => visit(step.id)))
      ctx.addIssue({ code: "custom", message: "cyclic workflow dependency" });
  });
export type AgentPlan = z.infer<typeof agentPlanSchema>;
export const workflowSchema = z.object({
  id: z.string().min(1).max(80),
  requestId: z.string().min(1).max(80),
  objective: z.string().max(1000),
  state: workflowStateSchema,
  createdAt: z.number(),
  steps: z.array(workflowStepSchema).max(20),
});
export type Workflow = z.infer<typeof workflowSchema>;
export type AgentExecution = {
  id: string;
  workflowId: string;
  requestId: string;
  state: WorkflowState;
  startedAt: number;
  finishedAt?: number;
  steps: Record<
    string,
    {
      state: WorkflowStepState;
      result: unknown;
      attempts: number;
      error?: string;
    }
  >;
  partialResult: boolean;
};
export type AgentResult = {
  executionId: string;
  workflowId: string;
  requestId: string;
  state: WorkflowState;
  steps: AgentExecution["steps"];
  partialResult: boolean;
  durationMs: number;
};
