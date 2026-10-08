import { nanoid } from "nanoid";
import { agentPlanSchema, type AgentPlan } from "./contracts";
export * from "./contracts";
export * from "./executor";
export const planWorkflow = (input: {
  requestId?: string;
  objective: string;
  steps: AgentPlan["steps"];
  requiredPermissions?: string[];
  budget?: Partial<AgentPlan["budget"]>;
}): AgentPlan =>
  agentPlanSchema.parse({
    requestId: input.requestId ?? nanoid(12),
    objective: input.objective,
    steps: input.steps,
    requiredPermissions: input.requiredPermissions ?? [],
    budget: {
      maxSteps: 10,
      maxToolCalls: 15,
      maxExecutionMs: 30000,
      maxContextChars: 8000,
      ...input.budget,
    },
    status: "validated",
  });
export const isExplicitWorkflowRequest = (text: string) =>
  /\b(?:do these \w+ tasks|then save|step \d+|workflow|agent plan|run this sequence)\b/i.test(
    text
  );
