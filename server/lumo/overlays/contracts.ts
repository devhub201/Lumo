import { z } from "zod";

export const normalizedRectSchema = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().gt(0).max(1),
    height: z.number().gt(0).max(1),
  })
  .refine(
    rect => rect.x + rect.width <= 1 && rect.y + rect.height <= 1,
    "normalized rectangle must remain inside the image"
  );
export type NormalizedRect = z.infer<typeof normalizedRectSchema>;
export const overlaySchema = z.object({
  id: z.string().min(1).max(80),
  type: z.enum(["object", "region"]),
  label: z.string().min(1).max(200),
  confidence: z.number().min(0).max(1).optional(),
  rect: normalizedRectSchema,
  metadata: z.record(z.string(), z.string()).optional(),
});
export type VisualOverlay = z.infer<typeof overlaySchema>;
export const overlayModelSchema = z.object({
  source: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    identity: z.string().max(200),
  }),
  overlays: z.array(overlaySchema).max(100),
  trust: z.literal("untrusted_visual_data"),
});
export type OverlayModel = z.infer<typeof overlayModelSchema>;
export const overlaySelectionSchema = z.object({
  overlayId: z.string().min(1).max(80),
  sourceIdentity: z.string().max(200),
});
