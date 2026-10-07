import { useMemo, useState } from "react";
import type {
  TeachingAnnotation,
  TeachingSession,
} from "../../../server/lumo/teaching/contracts";
import {
  currentAnnotation,
  nextTeachingStep,
  previousTeachingStep,
  finishTeaching,
} from "../../../server/lumo/teaching/state";
export function TeachingOverlay({
  imageSrc,
  session,
  onChange,
}: {
  imageSrc?: string;
  session: TeachingSession;
  onChange?: (session: TeachingSession) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const active = useMemo(() => currentAnnotation(session), [session]);
  const annotations = session.annotations.filter(
    a =>
      a.visible &&
      (session.currentSequence === 0 || a.sequence === session.currentSequence)
  );
  const advance = (next: TeachingSession) => onChange?.(next);
  return (
    <section className="teaching-overlay" aria-label="Explicit teaching mode">
      <div className="teaching-toolbar">
        <span className="eyebrow">teaching mode</span>
        <button
          type="button"
          onClick={() => advance(previousTeachingStep(session))}
        >
          Previous
        </button>
        <button
          type="button"
          onClick={() => advance(nextTeachingStep(session))}
        >
          Next
        </button>
        <button type="button" onClick={() => advance(finishTeaching(session))}>
          Finish
        </button>
      </div>
      <div className="teaching-stage">
        {imageSrc && <img src={imageSrc} alt="Teaching source" />}
        {annotations.map((a: TeachingAnnotation) => (
          <button
            key={a.id}
            type="button"
            className={`teaching-annotation ${a.type} ${selected === a.id ? "selected" : ""}`}
            style={{
              left: `${a.rect.x * 100}%`,
              top: `${a.rect.y * 100}%`,
              width: `${a.rect.width * 100}%`,
              height: `${a.rect.height * 100}%`,
            }}
            onClick={() => setSelected(a.id)}
            aria-label={a.title}
          >
            <span>
              {a.sequence}. {a.title}
            </span>
          </button>
        ))}
      </div>
      {active && (
        <p className="teaching-explanation">
          <strong>{active.title}</strong> — {active.explanation}
        </p>
      )}
    </section>
  );
}
