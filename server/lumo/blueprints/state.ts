import type { Blueprint, BlueprintNode, BlueprintViewport } from "./contracts";
export const initialViewport: BlueprintViewport = { scale: 1, x: 0, y: 0 };
export const zoomViewport = (
  viewport: BlueprintViewport,
  delta: number
): BlueprintViewport => ({
  ...viewport,
  scale: Math.max(0.25, Math.min(4, viewport.scale + delta)),
});
export const panViewport = (
  viewport: BlueprintViewport,
  dx: number,
  dy: number
): BlueprintViewport => ({
  ...viewport,
  x: viewport.x + dx,
  y: viewport.y + dy,
});
export const fitBlueprint = (
  blueprint: Blueprint,
  width: number,
  height: number
): BlueprintViewport => {
  if (!blueprint.nodes.length) return initialViewport;
  const minX = Math.min(...blueprint.nodes.map(n => n.x)),
    maxX = Math.max(...blueprint.nodes.map(n => n.x + n.width)),
    minY = Math.min(...blueprint.nodes.map(n => n.y)),
    maxY = Math.max(...blueprint.nodes.map(n => n.y + n.height));
  return {
    scale: Math.max(
      0.25,
      Math.min(
        2,
        Math.min(width / (maxX - minX + 80), height / (maxY - minY + 80))
      )
    ),
    x: (width - (maxX - minX)) / 2 - minX,
    y: (height - (maxY - minY)) / 2 - minY,
  };
};
export const connectedNodeIds = (blueprint: Blueprint, nodeId: string) =>
  new Set(
    blueprint.edges.flatMap(e =>
      e.from === nodeId ? [e.to] : e.to === nodeId ? [e.from] : []
    )
  );
export const selectBlueprintNode = (
  blueprint: Blueprint,
  nodeId: string | null
): BlueprintNode | null => blueprint.nodes.find(n => n.id === nodeId) || null;
