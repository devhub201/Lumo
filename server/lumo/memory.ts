import type {
  CreateMemoryInput,
  LumoMemory,
  LumoPersonality,
  MemoryKind,
} from "./contracts";
import { untrustedDataBoundary } from "./security/safety";

export const DEFAULT_PERSONALITY: LumoPersonality = {
  name: "LUMO",
  ownerName: "Peter",
  traits: [
    "intelligent",
    "calm",
    "natural",
    "conversational",
    "curious",
    "helpful",
    "precise",
    "honest",
    "technically capable",
  ],
  responseStyle: [
    "casual when appropriate",
    "deep when useful",
    "clear before clever",
    "no unnecessary formalities",
  ],
  boundaries: [
    "do not claim human feelings",
    "do not claim tools or capabilities that were not used",
    "do not repeat Peter's name in every response",
    "do not save every sentence as memory",
  ],
};

const clean = (value: string) =>
  value
    .trim()
    .replace(/[.?!]+$/, "")
    .trim();

export type MemoryCommand =
  | { type: "remember"; content: string; kind: MemoryKind }
  | { type: "forget"; query: string }
  | { type: "recall" };

export function inferMemoryKind(content: string): MemoryKind {
  const value = content.toLowerCase();
  if (/project|app|application|repository|codebase|build/.test(value))
    return "project";
  if (/prefer|preference|want|like|call me|address me|tone/.test(value))
    return "preference";
  if (/always|usually|every time|recurring|ongoing|currently/.test(value))
    return "recurring_context";
  if (/i am|my name|live in|work as|role is|about me/.test(value))
    return "user_profile";
  return "important_fact";
}

export function parseMemoryCommand(text: string): MemoryCommand | null {
  const value = text.trim();
  const remember = value.match(/^(?:please\s+)?remember(?:\s+that)?\s+(.+)$/i);
  if (remember) {
    const content = clean(remember[1]);
    return content
      ? { type: "remember", content, kind: inferMemoryKind(content) }
      : null;
  }
  if (
    /^(?:what\s+do\s+you\s+remember(?:\s+about\s+me)?|show\s+(?:my\s+)?memories|what\s+do\s+you\s+know\s+about\s+me)\??$/i.test(
      value
    )
  ) {
    return { type: "recall" };
  }
  const forget = value.match(/^(?:please\s+)?forget(?:\s+that)?\s+(.+)$/i);
  if (forget) {
    const query = clean(forget[1]);
    return query ? { type: "forget", query } : null;
  }
  return null;
}

export function inferDurableMemory(text: string): CreateMemoryInput | null {
  const value = clean(text);
  if (/^(?:my\s+)?project\s+is\s+(?:called|named)\s+.+$/i.test(value)) {
    return {
      ownerKey: "peter",
      kind: "project",
      content: value,
      importance: 80,
      source: "inferred",
    };
  }
  if (
    /^i\s+(?:want|would like)\s+(?:lumo\s+)?to\s+(?:call|address)\s+(?:me\s+)?/i.test(
      value
    )
  ) {
    return {
      ownerKey: "peter",
      kind: "preference",
      content: value,
      importance: 80,
      source: "inferred",
    };
  }
  return null;
}

export function personalityPrompt(personality: LumoPersonality) {
  return `Identity: You are ${personality.name}, Peter's personal AI companion and thinking partner.\nTraits: ${personality.traits.join(", ")}.\nStyle: ${personality.responseStyle.join("; ")}.\nBoundaries: ${personality.boundaries.join("; ")}.`;
}

export function memoryPrompt(
  memories: Array<{ kind: string; content: string; tags: string | null }>
) {
  if (!memories.length)
    return "Persistent memory: none of the stored memories matched this turn.";
  return `Persistent memory retrieved for this turn (use only when relevant):\n${memories
    .map(
      memory =>
        `- [${memory.kind}] ${untrustedDataBoundary(memory.content)}${memory.tags ? ` (${untrustedDataBoundary(memory.tags)})` : ""}`
    )
    .join("\n")}`;
}

export function formatRecall(memories: LumoMemory[]) {
  if (!memories.length)
    return "I don't have any persistent memories about you yet. If something matters long term, say 'Remember that…'.";
  return `Here is what I currently remember:\n${memories.map(memory => `- ${memory.content}`).join("\n")}`;
}
