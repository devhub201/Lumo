import { useMemo, useState } from "react";
import type { Blueprint } from "../../../server/lumo/blueprints/contracts";
import {
  connectedNodeIds,
  fitBlueprint,
  initialViewport,
  panViewport,
  zoomViewport,
} from "../../../server/lumo/blueprints/state";
export function BlueprintCanvas({
  blueprint,
  onSelect,
}: {
  blueprint: Blueprint;
  onSelect?: (nodeId: string | null) => void;
}) {
  const [viewport, setViewport] = useState(initialViewport);
  const [selected, setSelected] = useState<string | null>(null);
  const connected = useMemo(
    () =>
      selected ? connectedNodeIds(blueprint, selected) : new Set<string>(),
    [blueprint, selected]
  );
  return (
    <section
      className="blueprint-canvas"
      aria-label="Interactive blueprint canvas"
    >
      <div className="blueprint-toolbar">
        <button
          type="button"
          onClick={() => setViewport(v => zoomViewport(v, 0.1))}
        >
          Zoom +
        </button>
        <button
          type="button"
          onClick={() => setViewport(v => zoomViewport(v, -0.1))}
        >
          Zoom −
        </button>
        <button
          type="button"
          onClick={() => setViewport(v => panViewport(v, 20, 0))}
        >
          Pan →
        </button>
        <button
          type="button"
          onClick={() => setViewport(v => fitBlueprint(blueprint, 700, 360))}
        >
          Fit
        </button>
        <button type="button" onClick={() => setViewport(initialViewport)}>
          Reset
        </button>
      </div>
      <svg
        viewBox="0 0 700 360"
        role="img"
        aria-label={blueprint.title}
        onClick={() => {
          setSelected(null);
          onSelect?.(null);
        }}
      >
        <g
          transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.scale})`}
        >
          {blueprint.edges.map(edge => {
            const a = blueprint.nodes.find(n => n.id === edge.from),
              b = blueprint.nodes.find(n => n.id === edge.to);
            return a && b ? (
              <line
                key={edge.id}
                x1={a.x + a.width / 2}
                y1={a.y + a.height / 2}
                x2={b.x + b.width / 2}
                y2={b.y + b.height / 2}
                className={`blueprint-edge ${selected && (connected.has(edge.from) || connected.has(edge.to)) ? "active" : ""}`}
              />
            ) : null;
          })}
          {blueprint.nodes.map(node => (
            <g
              key={node.id}
              className={`blueprint-node ${selected === node.id ? "selected" : ""} ${selected && connected.has(node.id) ? "connected" : ""}`}
              onClick={e => {
                e.stopPropagation();
                setSelected(node.id);
                onSelect?.(node.id);
              }}
            >
              <rect
                x={node.x}
                y={node.y}
                width={node.width}
                height={node.height}
                rx="6"
              />
              <text x={node.x + 10} y={node.y + 28}>
                {node.label}
              </text>
            </g>
          ))}
        </g>
      </svg>
      {selected && (
        <p className="blueprint-selection">
          Selected node: {blueprint.nodes.find(n => n.id === selected)?.label}
        </p>
      )}
    </section>
  );
}
