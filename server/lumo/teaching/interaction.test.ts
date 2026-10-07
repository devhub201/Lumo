import { describe, expect, it } from "vitest";
import { teachingAnnotationSchema } from "./contracts";
import {
  nextTeachingStep,
  previousTeachingStep,
  finishTeaching,
  orderedAnnotations,
} from "./state";
import { detectModeCommand } from "../interaction/commands";
const session: any = {
  id: "s",
  sourceIdentity: "camera",
  currentSequence: 1,
  active: true,
  trust: "untrusted_teaching_data",
  annotations: [
    {
      id: "two",
      type: "red_box",
      rect: { x: 0.5, y: 0, width: 0.2, height: 0.2 },
      title: "two",
      explanation: "second",
      sequence: 2,
      visible: true,
    },
    {
      id: "one",
      type: "red_circle",
      rect: { x: 0, y: 0, width: 0.2, height: 0.2 },
      title: "one",
      explanation: "first",
      sequence: 1,
      visible: true,
    },
  ],
};
describe("teaching", () => {
  it("orders and progresses steps", () => {
    expect(orderedAnnotations(session).map(a => a.id)).toEqual(["one", "two"]);
    expect(nextTeachingStep(session).currentSequence).toBe(2);
    expect(
      previousTeachingStep(nextTeachingStep(session)).currentSequence
    ).toBe(1);
    expect(finishTeaching(session).active).toBe(false);
  });
  it("rejects invalid normalized annotations", () => {
    expect(
      teachingAnnotationSchema.safeParse({
        ...session.annotations[0],
        rect: { x: 0.9, y: 0, width: 0.2, height: 0.2 },
      }).success
    ).toBe(false);
  });
});
describe("interaction commands", () => {
  it("requires explicit full commands", () => {
    expect(detectModeCommand("voice mode")?.mode).toBe("voice");
    expect(detectModeCommand("please use voice in your answer")).toBeNull();
    expect(detectModeCommand("chat pe aa")?.mode).toBe("text");
    expect(detectModeCommand("camera kholo")?.mode).toBe("camera");
    expect(detectModeCommand("teaching mode")?.mode).toBe("teaching");
  });
});
