import { and, desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  lumoConversations,
  lumoMemories,
  lumoMessages,
  lumoSettings,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { LumoError } from "./errors";
import type {
  CreateMemoryInput,
  LumoConversation,
  LumoMemory,
  LumoStorage,
} from "./contracts";

const requireDb = async () => {
  const db = await getDb();
  if (!db) {
    throw new LumoError(
      "database_unavailable",
      "DATABASE_URL is not configured or the database connection is unavailable",
      "LUMO storage is not connected yet. Check the server database configuration.",
      true
    );
  }
  return db;
};

const toConversation = (
  row: typeof lumoConversations.$inferSelect
): LumoConversation => row;
const toMemory = (row: typeof lumoMemories.$inferSelect): LumoMemory => row;

export const tokenize = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map(token => token.trim())
    .filter(token => token.length >= 3);

export function rankMemories(
  memories: LumoMemory[],
  query: string,
  limit: number
) {
  const queryTokens = new Set(tokenize(query));
  return memories
    .map(memory => {
      const memoryTokens = new Set(
        tokenize(`${memory.content} ${memory.tags ?? ""} ${memory.kind}`)
      );
      const overlap = [...queryTokens].filter(token =>
        memoryTokens.has(token)
      ).length;
      const exactPhraseBoost = query
        .toLowerCase()
        .includes(memory.content.toLowerCase())
        ? 30
        : 0;
      const score =
        overlap * 10 +
        exactPhraseBoost +
        Math.min(memory.importance, 100) / 100;
      return { memory, score };
    })
    .filter(item => item.score > 1)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(item => item.memory);
}

export class DatabaseLumoStorage implements LumoStorage {
  async createConversation(input: {
    ownerKey: string;
    title: string;
    depthLevel?: number;
    depthTopic?: string | null;
  }) {
    const db = await requireDb();
    const id = nanoid(21);
    await db.insert(lumoConversations).values({
      id,
      ownerKey: input.ownerKey,
      title: input.title,
      depthLevel: input.depthLevel ?? 1,
      depthTopic: input.depthTopic ?? null,
    });
    const created = await this.getConversation(input.ownerKey, id);
    if (!created)
      throw new Error("Conversation was created but could not be read back");
    return created;
  }

  async getConversation(ownerKey: string, conversationId: string) {
    const db = await requireDb();
    const rows = await db
      .select()
      .from(lumoConversations)
      .where(eq(lumoConversations.id, conversationId))
      .limit(1);
    const conversation = rows[0];
    return conversation && conversation.ownerKey === ownerKey
      ? toConversation(conversation)
      : null;
  }

  async listConversations(ownerKey: string) {
    const db = await requireDb();
    const rows = await db
      .select()
      .from(lumoConversations)
      .where(eq(lumoConversations.ownerKey, ownerKey))
      .orderBy(desc(lumoConversations.updatedAt));
    return rows.map(toConversation);
  }

  async listMessages(conversationId: string, limit: number) {
    const db = await requireDb();
    const rows = await db
      .select()
      .from(lumoMessages)
      .where(eq(lumoMessages.conversationId, conversationId))
      .orderBy(desc(lumoMessages.sequence))
      .limit(limit);
    return rows.reverse();
  }

  async appendTurn(input: {
    conversationId: string;
    userContent: string;
    assistantContent: string;
    model: string;
    requestId: string;
    memoryIds: string[];
  }) {
    const db = await requireDb();
    const latest = await db
      .select({ sequence: lumoMessages.sequence })
      .from(lumoMessages)
      .where(eq(lumoMessages.conversationId, input.conversationId))
      .orderBy(desc(lumoMessages.sequence))
      .limit(1);
    const nextSequence = (latest[0]?.sequence ?? 0) + 1;
    const userId = nanoid(21);
    const assistantId = nanoid(21);
    const metadata = {
      requestId: input.requestId,
      model: input.model,
      memoryIds: input.memoryIds,
    };
    await db.insert(lumoMessages).values([
      {
        id: userId,
        conversationId: input.conversationId,
        sequence: nextSequence,
        role: "user",
        content: input.userContent,
        metadata: { requestId: input.requestId },
      },
      {
        id: assistantId,
        conversationId: input.conversationId,
        sequence: nextSequence + 1,
        role: "assistant",
        content: input.assistantContent,
        metadata,
      },
    ]);
    await db
      .update(lumoConversations)
      .set({ lastMessageAt: new Date(), updatedAt: new Date() })
      .where(eq(lumoConversations.id, input.conversationId));
    const rows = await db
      .select()
      .from(lumoMessages)
      .where(eq(lumoMessages.id, userId));
    const assistantRows = await db
      .select()
      .from(lumoMessages)
      .where(eq(lumoMessages.id, assistantId));
    return { userMessage: rows[0], assistantMessage: assistantRows[0] };
  }

  async updateConversation(input: {
    conversationId: string;
    depthLevel: number;
    depthTopic?: string | null;
    summary?: string | null;
  }) {
    const db = await requireDb();
    await db
      .update(lumoConversations)
      .set({
        depthLevel: input.depthLevel,
        ...(input.depthTopic === undefined
          ? {}
          : { depthTopic: input.depthTopic }),
        ...(input.summary === undefined
          ? {}
          : { summary: input.summary, summaryUpdatedAt: new Date() }),
        updatedAt: new Date(),
      })
      .where(eq(lumoConversations.id, input.conversationId));
  }

  async listMemories(ownerKey: string) {
    const db = await requireDb();
    const rows = await db
      .select()
      .from(lumoMemories)
      .where(
        and(eq(lumoMemories.ownerKey, ownerKey), eq(lumoMemories.isActive, 1))
      )
      .orderBy(desc(lumoMemories.updatedAt));
    return rows.map(toMemory);
  }

  async searchMemories(ownerKey: string, query: string, limit: number) {
    const memories = await this.listMemories(ownerKey);
    return rankMemories(memories, query, limit);
  }

  async createMemory(input: CreateMemoryInput) {
    const db = await requireDb();
    const id = nanoid(21);
    await db.insert(lumoMemories).values({
      id,
      ownerKey: input.ownerKey,
      kind: input.kind,
      content: input.content,
      tags: input.tags ?? null,
      importance: input.importance ?? 50,
      isActive: 1,
      metadata: input.source ? { source: input.source } : null,
    });
    const rows = await db
      .select()
      .from(lumoMemories)
      .where(eq(lumoMemories.id, id))
      .limit(1);
    return toMemory(rows[0]);
  }

  async deactivateMemory(ownerKey: string, memoryId: string) {
    const db = await requireDb();
    await db
      .update(lumoMemories)
      .set({ isActive: 0, updatedAt: new Date() })
      .where(
        and(eq(lumoMemories.ownerKey, ownerKey), eq(lumoMemories.id, memoryId))
      );
  }

  async getSetting(ownerKey: string, settingKey: string) {
    const db = await requireDb();
    const rows = await db
      .select({ value: lumoSettings.value })
      .from(lumoSettings)
      .where(
        and(
          eq(lumoSettings.ownerKey, ownerKey),
          eq(lumoSettings.settingKey, settingKey)
        )
      )
      .limit(1);
    return rows[0]?.value ?? null;
  }

  async setSetting(ownerKey: string, settingKey: string, value: string) {
    const db = await requireDb();
    await db
      .insert(lumoSettings)
      .values({ id: nanoid(21), ownerKey, settingKey, value })
      .onDuplicateKeyUpdate({ set: { value, updatedAt: new Date() } });
  }
}
