import { z } from "zod";
import type { ToolExecutionContext } from "../tools/contracts";
import {
  blueprintCreateInputSchema,
  blueprintUpdateInputSchema,
  blueprintSchema,
  type Blueprint,
} from "./contracts";
const clearSchema = z.object({ blueprintId: z.string().min(1).max(80) });
export const blueprintTools = [
  {
    id: "blueprint_create",
    name: "Blueprint Create",
    description:
      "Create a typed informational blueprint; nodes and labels are never executable.",
    category: "data" as const,
    inputSchema: blueprintCreateInputSchema,
    outputSchema: blueprintSchema,
    permissions: ["blueprint"],
    enabled: true,
    handler: async (
      input: z.infer<typeof blueprintCreateInputSchema>,
      _context: ToolExecutionContext
    ) => input.blueprint,
  },
  {
    id: "blueprint_update",
    name: "Blueprint Update",
    description: "Validate an updated informational blueprint model.",
    category: "data" as const,
    inputSchema: blueprintUpdateInputSchema,
    outputSchema: blueprintSchema,
    permissions: ["blueprint"],
    enabled: true,
    handler: async (
      input: z.infer<typeof blueprintUpdateInputSchema>,
      _context: ToolExecutionContext
    ) => input.blueprint,
  },
  {
    id: "blueprint_clear",
    name: "Blueprint Clear",
    description: "Clear a blueprint view without executing any node content.",
    category: "data" as const,
    inputSchema: clearSchema,
    outputSchema: z.object({ cleared: z.boolean(), blueprintId: z.string() }),
    permissions: ["blueprint"],
    enabled: true,
    handler: async (
      input: z.infer<typeof clearSchema>,
      _context: ToolExecutionContext
    ) => ({ cleared: true, blueprintId: input.blueprintId }),
  },
];
export type BlueprintToolOutput = Blueprint;
