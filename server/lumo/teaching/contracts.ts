import { z } from "zod";
export const teachingAnnotationSchema = z
  .object({
    id: z.string().min(1).max(80),
    type: z.enum([
      "red_box",
      "red_circle",
      "arrow",
      "pointer",
      "numbered_step",
      "text_callout",
    ]),
    rect: z.object({
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
      width: z.number().min(0).max(1),
      height: z.number().min(0).max(1),
    }),
    targetId: z.string().max(80).optional(),
    title: z.string().max(200),
    explanation: z.string().max(2000),
    sequence: z.number().int().positive(),
    visible: z.boolean().default(true),
    connector: z
      .object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) })
      .optional(),
  })
  .superRefine((v, c) => {
    if (v.rect.x + v.rect.width > 1 || v.rect.y + v.rect.height > 1)
      c.addIssue({
        code: "custom",
        message: "annotation rectangle must remain inside normalized bounds",
      });
  });
export type TeachingAnnotation = z.infer<typeof teachingAnnotationSchema>;
export const teachingSessionSchema = z.object({
  id: z.string().min(1).max(80),
  sourceIdentity: z.string().max(200),
  annotations: z.array(teachingAnnotationSchema).max(100),
  currentSequence: z.number().int().min(0),
  active: z.boolean(),
  trust: z.literal("untrusted_teaching_data"),
});
export type TeachingSession = z.infer<typeof teachingSessionSchema>;
export const teachingCreateInputSchema = z.object({
  session: teachingSessionSchema,
});
export const teachingProgressInputSchema = z.object({
  session: teachingSessionSchema,
  action: z.enum([
    "next",
    "previous",
    "repeat",
    "explain",
    "simpler",
    "finish",
  ]),
});
