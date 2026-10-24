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

export const lumoActionGrants = mysqlTable(
  "lumo_action_grants",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    ownerKey: varchar("ownerKey", { length: 64 }).notNull(),
    action: varchar("action", { length: 120 }).notNull(),
    resourceHash: varchar("resourceHash", { length: 64 }),
    tokenHash: varchar("tokenHash", { length: 64 }).notNull().unique(),
    nonce: varchar("nonce", { length: 64 }).notNull().unique(),
    expiresAt: timestamp("expiresAt").notNull(),
    consumedAt: timestamp("consumedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    consumeIdx: index("lumo_action_grants_consume_idx").on(
      table.ownerKey,
      table.action,
      table.tokenHash,
      table.expiresAt
    ),
  })
);

export const lumoActionAudits = mysqlTable(
  "lumo_action_audits",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    ownerKey: varchar("ownerKey", { length: 64 }).notNull(),
    action: varchar("action", { length: 120 }).notNull(),
    resourceHash: varchar("resourceHash", { length: 64 }),
    grantId: varchar("grantId", { length: 64 }),
    outcome: mysqlEnum("outcome", [
      "issued",
      "consumed",
      "rejected",
      "expired",
      "replayed",
    ]).notNull(),
    reason: varchar("reason", { length: 300 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    ownerCreatedIdx: index("lumo_action_audits_owner_created_idx").on(
      table.ownerKey,
      table.createdAt
    ),
  })
);

export const lumoOwnerMigrationRuns = mysqlTable("lumo_owner_migration_runs", {
  id: varchar("id", { length: 64 }).primaryKey(),
  legacyOwnerKey: varchar("legacyOwnerKey", { length: 64 }).notNull(),
  targetOwnerKey: varchar("targetOwnerKey", { length: 64 }).notNull(),
  verified: int("verified").notNull(),
  mode: mysqlEnum("mode", ["dry_run", "apply", "rollback"]).notNull(),
  status: mysqlEnum("status", ["planned", "applied", "rolled_back", "blocked"]).notNull(),
  report: json("report").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
});

export const lumoOwnerMigrationItems = mysqlTable(
  "lumo_owner_migration_items",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    runId: varchar("runId", { length: 64 }).notNull(),
    sourceKind: varchar("sourceKind", { length: 80 }).notNull(),
    recordId: varchar("recordId", { length: 255 }).notNull(),
    beforeChecksum: varchar("beforeChecksum", { length: 64 }).notNull(),
    afterChecksum: varchar("afterChecksum", { length: 64 }),
    restoredAt: timestamp("restoredAt"),
  },
  table => ({
    runItemUnique: uniqueIndex("lumo_owner_migration_run_item_unique").on(
      table.runId,
      table.sourceKind,
      table.recordId
    ),
  })
);

export const lumoProviderConnections = mysqlTable(
  "lumo_provider_connections",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    ownerKey: varchar("ownerKey", { length: 64 }).notNull(),
    provider: mysqlEnum("provider", ["github", "google"]).notNull(),
    providerAccountId: varchar("providerAccountId", { length: 255 }).notNull(),
    providerLogin: varchar("providerLogin", { length: 320 }),
    accessTokenCiphertext: text("accessTokenCiphertext").notNull(),
    refreshTokenCiphertext: text("refreshTokenCiphertext"),
    tokenKeyVersion: int("tokenKeyVersion").notNull(),
    accessTokenExpiresAt: timestamp("accessTokenExpiresAt"),
    scopes: json("scopes").$type<string[]>().notNull(),
    state: mysqlEnum("state", ["connected", "expired", "revoked", "error"])
      .notNull()
      .default("connected"),
    lastRefreshAt: timestamp("lastRefreshAt"),
    lastValidatedAt: timestamp("lastValidatedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    ownerProviderUnique: uniqueIndex("lumo_provider_connections_owner_provider_unique").on(
      table.ownerKey,
      table.provider
    ),
    ownerStateIdx: index("lumo_provider_connections_owner_state_idx").on(
      table.ownerKey,
      table.state
    ),
  })
);

export const lumoOAuthStates = mysqlTable(
  "lumo_oauth_states",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    stateHash: varchar("stateHash", { length: 64 }).notNull().unique(),
    ownerKey: varchar("ownerKey", { length: 64 }).notNull(),
    provider: mysqlEnum("provider", ["github", "google"]).notNull(),
    pkceVerifierCiphertext: text("pkceVerifierCiphertext"),
    keyVersion: int("keyVersion"),
    redirectUri: varchar("redirectUri", { length: 2048 }).notNull(),
    expiresAt: timestamp("expiresAt").notNull(),
    consumedAt: timestamp("consumedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    consumeIdx: index("lumo_oauth_states_consume_idx").on(
      table.stateHash,
      table.provider,
      table.expiresAt
    ),
    ownerIdx: index("lumo_oauth_states_owner_idx").on(table.ownerKey),
  })
);
