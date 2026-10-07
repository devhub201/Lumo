import type { VisionResult } from "../vision/contracts";
import {
  normalizedRectSchema,
  type OverlayModel,
  type NormalizedRect,
} from "./contracts";
const clampRect = (rect: NormalizedRect): NormalizedRect | null => {
  const x = Math.max(0, Math.min(1, rect.x)),
    y = Math.max(0, Math.min(1, rect.y));
  const width = Math.min(1 - x, Math.max(0, rect.width)),
    height = Math.min(1 - y, Math.max(0, rect.height));
  const parsed = normalizedRectSchema.safeParse({ x, y, width, height });
  return parsed.success ? parsed.data : null;
};
export const overlayModelFromVision = (
  result: VisionResult,
  dimensions: { width: number; height: number }
): OverlayModel => {
  const overlays = result.objects.flatMap((object, index) => {
    if (!object.box) return [];
    const rect = clampRect(object.box);
    if (!rect) return [];
    return [
      {
        id: `${result.requestId}:object:${index}`,
        type: "object" as const,
        label: object.label.slice(0, 200),
        ...(object.confidence === undefined
          ? {}
          : { confidence: object.confidence }),
        rect,
      },
    ];
  });
  return {
    source: { ...dimensions, identity: result.source.identity },
    overlays,
    trust: "untrusted_visual_data",
  };
};
export const mapNormalizedRectToViewport = (
  rect: NormalizedRect,
  viewport: { width: number; height: number }
) => ({
  x: rect.x * viewport.width,
  y: rect.y * viewport.height,
  width: rect.width * viewport.width,
  height: rect.height * viewport.height,
});
