import { describe, expect, it } from "vitest";
import {
  formatRecall,
  inferDurableMemory,
  inferMemoryKind,
  parseMemoryCommand,
} from "./memory";

describe("LUMO memory lifecycle", () => {
  it("parses remember, forget, and recall commands", () => {
    expect(
      parseMemoryCommand("Remember that I want LUMO to call me Peter.")
    ).toMatchObject({ type: "remember", kind: "preference" });
    expect(parseMemoryCommand("Forget that gardening is my hobby.")).toEqual({
      type: "forget",
      query: "gardening is my hobby",
    });
    expect(parseMemoryCommand("What do you remember about me?")).toEqual({
      type: "recall",
    });
  });

  it("classifies structured long-term information conservatively", () => {
    expect(inferMemoryKind("My project is called LUMO")).toBe("project");
    expect(inferMemoryKind("I want LUMO to call me Peter")).toBe("preference");
    expect(inferDurableMemory("My project is called LUMO.")).toMatchObject({
      kind: "project",
      source: "inferred",
    });
    expect(inferDurableMemory("The sky is blue.")).toBeNull();
  });

  it("formats a useful recall response without exposing storage metadata", () => {
    expect(formatRecall([])).toContain("don't have any persistent memories");
    expect(
      formatRecall([
        {
          id: "1",
          ownerKey: "peter",
          kind: "project",
          content: "My project is called LUMO",
          tags: null,
          importance: 80,
          isActive: 1,
          metadata: { source: "inferred" },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ])
    ).toContain("My project is called LUMO");
  });
});
