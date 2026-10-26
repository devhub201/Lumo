import { createHash } from "node:crypto";
import { copyFile, mkdir, readdir, readFile, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { and, eq, inArray } from "drizzle-orm";
import {
  lumoConversations,
  lumoMemories,
  lumoMessages,
  lumoOwnerMigrationItems,
  lumoOwnerMigrationRuns,
  lumoSettings,
} from "../../../drizzle/schema";
import { getDb } from "../../db";
import {
  LEGACY_OWNER_KEY,
  type LegacyInventory,
  type LegacyInventoryItem,
  type LegacyMigrationBackend,
  type LegacyMigrationPlan,
} from "./legacy-owner";

const ownerDirectory = (ownerKey: string) =>
  createHash("sha256").update(ownerKey).digest("hex").slice(0, 32);
const checksum = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const fileChecksum = async (file: string) =>
  createHash("sha256").update(await readFile(file)).digest("hex");

export async function inventoryLegacyOwner(
  filesystemRoot = path.resolve(
    process.env.LUMO_FILE_ROOT || path.join(process.cwd(), ".lumo-files")
  )
): Promise<LegacyInventory> {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable; migration is blocked.");
  const conversations = await db
    .select()
    .from(lumoConversations)
    .where(eq(lumoConversations.ownerKey, LEGACY_OWNER_KEY));
  const conversationIds = conversations.map(row => row.id);
  const messages = conversationIds.length
    ? await db
        .select()
        .from(lumoMessages)
        .where(inArray(lumoMessages.conversationId, conversationIds))
    : [];
  const memories = await db
    .select()
    .from(lumoMemories)
    .where(eq(lumoMemories.ownerKey, LEGACY_OWNER_KEY));
  const settings = await db
    .select()
    .from(lumoSettings)
    .where(eq(lumoSettings.ownerKey, LEGACY_OWNER_KEY));
  const items: LegacyInventoryItem[] = [
    ...conversations.map(row => ({
      sourceKind: "conversation" as const,
      recordId: row.id,
      checksum: checksum(row),
    })),
    ...messages.map(row => ({
      sourceKind: "message" as const,
      recordId: row.id,
      checksum: checksum(row),
    })),
    ...memories.map(row => ({
      sourceKind: "memory" as const,
      recordId: row.id,
      checksum: checksum(row),
    })),
    ...settings.map(row => ({
      sourceKind: "setting" as const,
      recordId: row.id,
      checksum: checksum(row),
    })),
  ];

  const legacyRoot = path.join(filesystemRoot, ownerDirectory(LEGACY_OWNER_KEY));
  try {
    for (const entry of await readdir(legacyRoot)) {
      const file = path.join(legacyRoot, entry);
      if ((await stat(file)).isFile())
        items.push({
          sourceKind: "file",
          recordId: entry,
          checksum: await fileChecksum(file),
          bytes: (await stat(file)).size,
        });
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return {
    generatedAt: new Date().toISOString(),
    items,
    filesystemRoots: [legacyRoot],
  };
}

const copyTree = async (source: string, destination: string): Promise<void> => {
  await mkdir(destination, { recursive: true });
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isDirectory()) await copyTree(from, to);
    else await copyFile(from, to);
  }
};

export class DatabaseLegacyMigrationBackend implements LegacyMigrationBackend {
  constructor(
    private readonly filesystemRoot = path.resolve(
      process.env.LUMO_FILE_ROOT || path.join(process.cwd(), ".lumo-files")
    ),
    private readonly backupRoot = path.resolve(
      process.env.LUMO_MIGRATION_BACKUP_ROOT || path.join(process.cwd(), ".lumo-migration-backups")
    )
  ) {}

  async backup(plan: LegacyMigrationPlan) {
    const db = await getDb();
    if (!db) throw new Error("Database is unavailable; migration is blocked.");
    await db.insert(lumoOwnerMigrationRuns).values({
      id: plan.runId,
      legacyOwnerKey: LEGACY_OWNER_KEY,
      targetOwnerKey: plan.mapping.targetOwnerKey,
      verified: 1,
      mode: "apply",
      status: "planned",
      report: plan.report,
    });
    await db.insert(lumoOwnerMigrationItems).values(
      plan.inventory.items.map(item => ({
        id: `${plan.runId}_${item.sourceKind}_${item.recordId}`.slice(0, 64),
        runId: plan.runId,
        sourceKind: item.sourceKind,
        recordId: item.recordId,
        beforeChecksum: item.checksum,
      }))
    );
    const source = path.join(this.filesystemRoot, ownerDirectory(LEGACY_OWNER_KEY));
    try {
      await copyTree(source, path.join(this.backupRoot, plan.runId));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  async rewriteOwner(plan: LegacyMigrationPlan) {
    const db = await getDb();
    if (!db) throw new Error("Database is unavailable; migration is blocked.");
    const conversationIds = plan.inventory.items
      .filter(item => item.sourceKind === "conversation")
      .map(item => item.recordId);
    const memoryIds = plan.inventory.items
      .filter(item => item.sourceKind === "memory")
      .map(item => item.recordId);
    const settingIds = plan.inventory.items
      .filter(item => item.sourceKind === "setting")
      .map(item => item.recordId);
    await db.transaction(async tx => {
      if (conversationIds.length)
        await tx
          .update(lumoConversations)
          .set({ ownerKey: plan.mapping.targetOwnerKey })
          .where(
            and(
              eq(lumoConversations.ownerKey, LEGACY_OWNER_KEY),
              inArray(lumoConversations.id, conversationIds)
            )
          );
      if (memoryIds.length)
        await tx
          .update(lumoMemories)
          .set({ ownerKey: plan.mapping.targetOwnerKey })
          .where(
            and(
              eq(lumoMemories.ownerKey, LEGACY_OWNER_KEY),
              inArray(lumoMemories.id, memoryIds)
            )
          );
      if (settingIds.length)
        await tx
          .update(lumoSettings)
          .set({ ownerKey: plan.mapping.targetOwnerKey })
          .where(
            and(
              eq(lumoSettings.ownerKey, LEGACY_OWNER_KEY),
              inArray(lumoSettings.id, settingIds)
            )
          );
      await tx
        .update(lumoOwnerMigrationRuns)
        .set({ status: "applied", completedAt: new Date() })
        .where(eq(lumoOwnerMigrationRuns.id, plan.runId));
    });
    await this.renameWorkspace(plan, LEGACY_OWNER_KEY, plan.mapping.targetOwnerKey);
  }

  async restore(plan: LegacyMigrationPlan) {
    const db = await getDb();
    if (!db) throw new Error("Database is unavailable; migration is blocked.");
    const conversationIds = plan.inventory.items
      .filter(item => item.sourceKind === "conversation")
      .map(item => item.recordId);
    const memoryIds = plan.inventory.items
      .filter(item => item.sourceKind === "memory")
      .map(item => item.recordId);
    const settingIds = plan.inventory.items
      .filter(item => item.sourceKind === "setting")
      .map(item => item.recordId);
    await this.renameWorkspace(plan, plan.mapping.targetOwnerKey, LEGACY_OWNER_KEY);
    await db.transaction(async tx => {
      if (conversationIds.length)
        await tx
          .update(lumoConversations)
          .set({ ownerKey: LEGACY_OWNER_KEY })
          .where(
            and(
              eq(lumoConversations.ownerKey, plan.mapping.targetOwnerKey),
              inArray(lumoConversations.id, conversationIds)
            )
          );
      if (memoryIds.length)
        await tx
          .update(lumoMemories)
          .set({ ownerKey: LEGACY_OWNER_KEY })
          .where(
            and(
              eq(lumoMemories.ownerKey, plan.mapping.targetOwnerKey),
              inArray(lumoMemories.id, memoryIds)
            )
          );
      if (settingIds.length)
        await tx
          .update(lumoSettings)
          .set({ ownerKey: LEGACY_OWNER_KEY })
          .where(
            and(
              eq(lumoSettings.ownerKey, plan.mapping.targetOwnerKey),
              inArray(lumoSettings.id, settingIds)
            )
          );
      await tx
        .update(lumoOwnerMigrationRuns)
        .set({ status: "rolled_back", completedAt: new Date() })
        .where(eq(lumoOwnerMigrationRuns.id, plan.runId));
    });
  }

  private async renameWorkspace(
    plan: LegacyMigrationPlan,
    fromOwner: string,
    toOwner: string
  ) {
    const from = path.join(this.filesystemRoot, ownerDirectory(fromOwner));
    const to = path.join(this.filesystemRoot, ownerDirectory(toOwner));
    try {
      await stat(to);
      throw new Error("Target filesystem workspace already exists.");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    try {
      await rename(from, to);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}
