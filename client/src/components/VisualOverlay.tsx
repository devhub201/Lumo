import { useMemo, useState } from "react";
import type {
  OverlayModel,
  VisualOverlay,
} from "../../../server/lumo/overlays/contracts";
export function VisualOverlay({
  imageSrc,
  model,
  onSelect,
}: {
  imageSrc?: string;
  model: OverlayModel;
  onSelect?: (overlay: VisualOverlay) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const items = useMemo(() => model.overlays, [model]);
  return (
    <div
      className="visual-overlay"
      role="img"
      aria-label="Visual analysis with selectable overlays"
    >
      {imageSrc && (
        <img
          src={imageSrc}
          alt="Analyzed visual input"
          className="visual-overlay-image"
        />
      )}
      {items.map(item => (
        <button
          key={item.id}
          type="button"
          className={`visual-overlay-box ${selected === item.id ? "selected" : ""}`}
          style={{
            left: `${item.rect.x * 100}%`,
            top: `${item.rect.y * 100}%`,
            width: `${item.rect.width * 100}%`,
            height: `${item.rect.height * 100}%`,
          }}
          onClick={() => {
            setSelected(item.id);
            onSelect?.(item);
          }}
          aria-label={`Select ${item.label}`}
        >
          <span>
            {item.label}
            {item.confidence === undefined
              ? ""
              : ` · ${Math.round(item.confidence * 100)}%`}
          </span>
        </button>
      ))}
    </div>
  );
}
