import type { ToolExecutionContext } from "../tools/contracts";
import {
  teachingCreateInputSchema,
  teachingProgressInputSchema,
  teachingSessionSchema,
  type TeachingSession,
} from "./contracts";
import {
  nextTeachingStep,
  previousTeachingStep,
  finishTeaching,
  repeatTeachingStep,
} from "./state";
export const teachingTools = [
  {
    id: "teaching_create",
    name: "Teaching Create",
    description: "Create an explicit user-controlled visual teaching session.",
    category: "media" as const,
    inputSchema: teachingCreateInputSchema,
    outputSchema: teachingSessionSchema,
    permissions: ["teaching"],
    enabled: true,
    handler: async (input: any, _: ToolExecutionContext) => input.session,
  },
  {
    id: "teaching_progress",
    name: "Teaching Progress",
    description:
      "Move an explicit teaching session to next, previous, repeat, simpler, explain, or finish.",
    category: "media" as const,
    inputSchema: teachingProgressInputSchema,
    outputSchema: teachingSessionSchema,
    permissions: ["teaching"],
    enabled: true,
    handler: async (
      input: any,
      _: ToolExecutionContext
    ): Promise<TeachingSession> =>
      input.action === "next"
        ? nextTeachingStep(input.session)
        : input.action === "previous"
          ? previousTeachingStep(input.session)
          : input.action === "finish"
            ? finishTeaching(input.session)
            : repeatTeachingStep(input.session),
  },
];
