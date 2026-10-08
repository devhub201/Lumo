import type { MemoryKind, LumoMemory } from "../contracts";
import {
  looksLikeInstructionInjection,
  sanitizePublicText,
} from "../security/safety";
export type RefinedMemoryCategory =
  | "user_preference"
  | "project_context"
  | "workflow_preference"
  | "stable_instruction"
  | "factual_context"
  | "temporary_context"
  | "system_derived_context";
export type Sensitivity = "normal" | "sensitive" | "restricted";
export type RefinedMemoryRecord = {
  id: string;
  content: string;
  category: RefinedMemoryCategory;
  source: "explicit" | "inferred" | "system";
  confidence: number;
  importance: number;
  createdAt: Date;
  updatedAt: Date;
  expiresAt?: Date;
  accessCount: number;
  sensitivity: Sensitivity;
  enabled: boolean;
  scope: string;
};
const sensitivePattern =
  /password|passcode|secret|api[_ -]?key|token|credit card|bank account|ssn|national id|medical diagnosis/i;
export const classifySensitivity = (content: string): Sensitivity =>
  sensitivePattern.test(content) ? "restricted" : "normal";
export const isMemoryWriteEligible = (
  content: string,
  source: "explicit" | "inferred" | "system" | "conversation_summary"
) =>
  source !== "system" &&
  source !== "conversation_summary" &&
  classifySensitivity(content) === "normal" &&
  !looksLikeInstructionInjection(content) &&
  content.trim().length >= 3;
const CATEGORY_BY_KIND: Record<MemoryKind, RefinedMemoryCategory> = {
  preference: "user_preference",
  project: "project_context",
  recurring_context: "workflow_preference",
  user_profile: "factual_context",
  important_fact: "factual_context",
  fact: "factual_context",
  conversation_summary: "temporary_context",
  summary: "temporary_context",
  knowledge: "system_derived_context",
};
export const categoryForKind = (kind: MemoryKind): RefinedMemoryCategory =>
  CATEGORY_BY_KIND[kind];
export const memoryRelevanceScore = (
  memory: Pick<LumoMemory, "content" | "importance" | "updatedAt">,
  query: string,
  now = Date.now()
) => {
  const terms = query.toLowerCase().split(/\W+/).filter(Boolean);
  const content = memory.content.toLowerCase();
  const lexical = terms.length
    ? terms.filter(term => content.includes(term)).length / terms.length
    : 0;
  const ageDays = Math.max(0, (now - memory.updatedAt.getTime()) / 86400000);
  const recency = Math.exp(-ageDays / 30);
  return lexical * 0.5 + (memory.importance / 100) * 0.3 + recency * 0.2;
};
export const rankRefinedMemories = (
  memories: LumoMemory[],
  query: string,
  limit = 5
) =>
  memories
    .filter(
      m => m.isActive === 1 && classifySensitivity(m.content) === "normal"
    )
    .map(memory => ({ memory, score: memoryRelevanceScore(memory, query) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(0, Math.min(limit, 5)))
    .map(({ memory }) => ({
      ...memory,
      content: sanitizePublicText(memory.content),
    }));
