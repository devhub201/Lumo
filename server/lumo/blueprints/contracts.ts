import { z } from "zod";
export const pointSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});
export const blueprintNodeSchema = z.object({
  id: z.string().min(1).max(80),
  label: z.string().min(1).max(200),
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().positive().max(1000).default(160),
  height: z.number().positive().max(600).default(70),
  metadata: z.record(z.string(), z.string()).optional(),
});
export const blueprintEdgeSchema = z.object({
  id: z.string().min(1).max(80),
  from: z.string().min(1),
  to: z.string().min(1),
  label: z.string().max(200).optional(),
});
export const blueprintGroupSchema = z.object({
  id: z.string().min(1).max(80),
  label: z.string().max(200),
  nodeIds: z.array(z.string()).max(100),
});
export const blueprintSchema = z
  .object({
    id: z.string().min(1).max(80),
    title: z.string().max(200),
    nodes: z.array(blueprintNodeSchema).max(200),
    edges: z.array(blueprintEdgeSchema).max(400),
    groups: z.array(blueprintGroupSchema).max(100),
    trust: z.literal("untrusted_blueprint_data"),
  })
  .superRefine((value, ctx) => {
    const ids = new Set(value.nodes.map(n => n.id));
    for (const edge of value.edges)
      if (!ids.has(edge.from) || !ids.has(edge.to))
        ctx.addIssue({ code: "custom", message: "edge endpoint missing" });
  });
export type Blueprint = z.infer<typeof blueprintSchema>;
export type BlueprintNode = z.infer<typeof blueprintNodeSchema>;
export type BlueprintViewport = { scale: number; x: number; y: number };
export const blueprintCreateInputSchema = z.object({
  blueprint: blueprintSchema,
});
export const blueprintUpdateInputSchema = z.object({
  blueprint: blueprintSchema,
});
