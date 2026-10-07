import {
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

/** Core user table backing the supplied auth flow. */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const lumoConversations = mysqlTable(
  "lumo_conversations",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    ownerKey: varchar("ownerKey", { length: 64 }).notNull(),
    title: varchar("title", { length: 160 }).notNull(),
    depthLevel: int("depthLevel").default(1).notNull(),
    depthTopic: varchar("depthTopic", { length: 255 }),
    summary: text("summary"),
    summaryUpdatedAt: timestamp("summaryUpdatedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
    lastMessageAt: timestamp("lastMessageAt").defaultNow().notNull(),
  },
  table => ({
    ownerUpdatedIdx: index("lumo_conversations_owner_updated_idx").on(
      table.ownerKey,
      table.updatedAt
    ),
  })
);

export const lumoMessages = mysqlTable(
  "lumo_messages",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    conversationId: varchar("conversationId", { length: 36 }).notNull(),
    sequence: int("sequence").notNull(),
    role: mysqlEnum("role", ["user", "assistant", "system", "tool"]).notNull(),
    content: text("content").notNull(),
    metadata: json("metadata").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    conversationSequenceIdx: index(
      "lumo_messages_conversation_sequence_idx"
    ).on(table.conversationId, table.sequence),
  })
);

export const lumoMemories = mysqlTable(
  "lumo_memories",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    ownerKey: varchar("ownerKey", { length: 64 }).notNull(),
    kind: mysqlEnum("kind", [
      "user_profile",
      "preference",
      "important_fact",
      "fact",
      "project",
      "recurring_context",
      "conversation_summary",
      "summary",
      "knowledge",
    ]).notNull(),
    content: text("content").notNull(),
    tags: varchar("tags", { length: 500 }),
    importance: int("importance").default(50).notNull(),
    isActive: int("isActive").default(1).notNull(),
    metadata: json("metadata").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    ownerActiveIdx: index("lumo_memories_owner_active_idx").on(
      table.ownerKey,
      table.isActive
    ),
  })
);

export const lumoSettings = mysqlTable(
  "lumo_settings",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    ownerKey: varchar("ownerKey", { length: 64 }).notNull(),
    settingKey: varchar("settingKey", { length: 100 }).notNull(),
    value: text("value").notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    ownerSettingUnique: uniqueIndex("lumo_settings_owner_setting_unique").on(
      table.ownerKey,
      table.settingKey
    ),
  })
);
