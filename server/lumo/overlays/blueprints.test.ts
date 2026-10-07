import { describe, expect, it } from "vitest";
import {
  overlayModelFromVision,
  mapNormalizedRectToViewport,
} from "./normalize";
import { normalizedRectSchema } from "./contracts";
import { blueprintSchema } from "../blueprints/contracts";
import {
  connectedNodeIds,
  fitBlueprint,
  panViewport,
  zoomViewport,
} from "../blueprints/state";
const vision: any = {
  requestId: "r1",
  source: {
    kind: "upload",
    identity: "camera",
    mimeType: "image/png",
    byteLength: 10,
  },
  objects: [
    {
      label: "box",
      box: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
      confidence: 0.8,
    },
    { label: "invalid", box: { x: 2, y: 0, width: 1, height: 1 } },
  ],
  text: [],
  observations: [],
  description: "x",
  confidence: null,
  provider: { name: "fake", model: null },
  diagnostics: { durationMs: 1, truncated: false },
  error: null,
  contentTrust: "untrusted_visual_data",
};
const blueprint: any = {
  id: "b",
  title: "flow",
  nodes: [
    { id: "a", label: "A", x: 0, y: 0, width: 100, height: 50 },
    { id: "b", label: "B", x: 200, y: 0, width: 100, height: 50 },
  ],
  edges: [{ id: "e", from: "a", to: "b" }],
  groups: [],
  trust: "untrusted_blueprint_data",
};
describe("Phase 14 overlays", () => {
  it("normalizes and maps boxes independent of viewport", () => {
    const model = overlayModelFromVision(vision, { width: 1000, height: 500 });
    expect(model.overlays).toHaveLength(1);
    expect(
      mapNormalizedRectToViewport(model.overlays[0].rect, {
        width: 500,
        height: 250,
      })
    ).toMatchObject({ x: 50, y: 50, width: 150, height: 100 });
  });
  it("rejects out-of-bounds overlay coordinates", () => {
    expect(
      normalizedRectSchema.safeParse({ x: 0.9, y: 0, width: 0.2, height: 0.2 })
        .success
    ).toBe(false);
  });
});
describe("Phase 15 blueprints", () => {
  it("validates node relationships and connected selection", () => {
    expect(blueprintSchema.parse(blueprint).id).toBe("b");
    expect([...connectedNodeIds(blueprint, "a")]).toEqual(["b"]);
    expect(() =>
      blueprintSchema.parse({
        ...blueprint,
        edges: [{ id: "x", from: "a", to: "missing" }],
      })
    ).toThrow();
  });
  it("supports pan, zoom, and fit-to-content", () => {
    expect(zoomViewport({ scale: 1, x: 0, y: 0 }, 0.2).scale).toBe(1.2);
    expect(panViewport({ scale: 1, x: 0, y: 0 }, 4, -2)).toMatchObject({
      x: 4,
      y: -2,
    });
    expect(fitBlueprint(blueprint, 700, 360).scale).toBeGreaterThan(0);
  });
});
