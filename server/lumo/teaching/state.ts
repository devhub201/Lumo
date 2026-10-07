import type { TeachingAnnotation, TeachingSession } from "./contracts";
export const orderedAnnotations = (session: TeachingSession) =>
  [...session.annotations].sort((a, b) => a.sequence - b.sequence);
export const currentAnnotation = (session: TeachingSession) =>
  orderedAnnotations(session).find(
    a => a.sequence === session.currentSequence
  ) || null;
export const nextTeachingStep = (session: TeachingSession): TeachingSession => {
  const next = orderedAnnotations(session).find(
    a => a.sequence > session.currentSequence
  );
  return next ? { ...session, currentSequence: next.sequence } : session;
};
export const previousTeachingStep = (
  session: TeachingSession
): TeachingSession => {
  const prior = orderedAnnotations(session)
    .filter(a => a.sequence < session.currentSequence)
    .pop();
  return prior ? { ...session, currentSequence: prior.sequence } : session;
};
export const repeatTeachingStep = (
  session: TeachingSession
): TeachingSession => ({ ...session });
export const finishTeaching = (session: TeachingSession): TeachingSession => ({
  ...session,
  active: false,
});
export const upsertAnnotation = (
  session: TeachingSession,
  annotation: TeachingAnnotation
): TeachingSession => ({
  ...session,
  annotations: [
    ...session.annotations.filter(a => a.id !== annotation.id),
    annotation,
  ].sort((a, b) => a.sequence - b.sequence),
});
export const removeAnnotation = (
  session: TeachingSession,
  id: string
): TeachingSession => ({
  ...session,
  annotations: session.annotations.filter(a => a.id !== id),
});
