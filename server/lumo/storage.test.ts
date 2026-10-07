import { describe, expect, it } from "vitest";
import { rankMemories, tokenize } from "./storage";
import type { LumoMemory } from "./contracts";

const memory = (id: string, content: string, importance = 50): LumoMemory => ({
  id,
  ownerKey: "peter",
  kind: "knowledge",
  content,
  tags: null,
  importance,
  isActive: 1,
  metadata: null,
  createdAt: new Date(),
  updatedAt: new Date(),
});

describe("memory retrieval", () => {
  it("tokenizes searchable words and ignores short punctuation fragments", () => {
    expect(tokenize("Peter's black-hole notes!")).toEqual([
      "peter",
      "black-hole",
      "notes",
    ]);
  });

  it("ranks memories by lexical relevance with importance as a tie-breaker", () => {
    const results = rankMemories(
      [
        memory("low", "A note about black holes", 20),
        memory("high", "Black holes and event horizons", 90),
        memory("other", "A note about gardening", 100),
      ],
      "Explain black holes and event horizons",
      2
    );
    expect(results.map(item => item.id)).toEqual(["high", "low"]);
  });
});
