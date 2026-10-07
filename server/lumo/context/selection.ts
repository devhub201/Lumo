import type { LumoMemory } from "../contracts";
import {
  DEFAULT_CONTEXT_PRIORITIES,
  type ContextMessage,
  type ContextPriorities,
  type ContextSourceName,
} from "./contracts";

export const mergePriorities = (
  overrides: Partial<ContextPriorities> = {}
): ContextPriorities => ({ ...DEFAULT_CONTEXT_PRIORITIES, ...overrides });

export const tokenize = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter(token => token.length >= 3);

const overlap = (query: string, value: string) => {
  const queryTokens = new Set(tokenize(query));
  const valueTokens = new Set(tokenize(value));
  return [...queryTokens].filter(token => valueTokens.has(token)).length;
};

export const scoreMemory = (query: string, memory: LumoMemory) => {
  const contentOverlap = overlap(
    query,
    `${memory.content} ${memory.tags ?? ""}`
  );
  const categoryOverlap = contentOverlap > 0 ? overlap(query, memory.kind) : 0;
  const broadlyRelevant = [
    "user_profile",
    "preference",
    "recurring_context",
  ].includes(memory.kind)
    ? 1.5
    : 0;
  const importance = Number.isFinite(memory.importance)
    ? Math.min(memory.importance, 100) / 100
    : 0;
  return (
    contentOverlap * 10 + categoryOverlap * 2 + broadlyRelevant + importance
  );
};

export const selectMemories = (
  query: string,
  memories: LumoMemory[],
  limit: number
) =>
  memories
    .map(memory => ({ memory, score: scoreMemory(query, memory) }))
    .filter(item => item.score > 1)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(item => item.memory);

export const selectRecentMessages = (
  messages: ContextMessage[],
  limit: number
) => messages.slice(Math.max(0, messages.length - limit));

export const orderSources = (priorities: ContextPriorities) =>
  (Object.keys(priorities) as ContextSourceName[]).sort(
    (a, b) => priorities[b] - priorities[a]
  );
