import { createHash } from "node:crypto";

export const LEGACY_OWNER_KEY = "peter" as const;

export type LegacyOwnerMapping = {
  legacyOwnerKey: typeof LEGACY_OWNER_KEY;
  targetOwnerKey: `user:${number}`;
  targetUserId: number;
  verified: true;
  verificationSource: string;
};

export type LegacyInventoryItem = {
  sourceKind: "conversation" | "message" | "memory" | "setting" | "file";
  recordId: string;
  checksum: string;
  bytes?: number;
};

export type LegacyInventory = {
  generatedAt: string;
  items: LegacyInventoryItem[];
  filesystemRoots: string[];
};

export type LegacyMigrationReport = {
  legacyOwnerKey: string;
  targetOwnerKey: string;
  dryRun: boolean;
  verified: boolean;
  conflictCount: number;
  itemCount: number;
  bySourceKind: Record<string, number>;
  filesystemRoots: string[];
  checksum: string;
};

export type LegacyMigrationPlan = {
  runId: string;
  mapping: LegacyOwnerMapping;
  inventory: LegacyInventory;
  report: LegacyMigrationReport;
};

export interface LegacyMigrationBackend {
  backup(plan: LegacyMigrationPlan): Promise<void>;
  rewriteOwner(plan: LegacyMigrationPlan): Promise<void>;
  restore(plan: LegacyMigrationPlan): Promise<void>;
}

export class LegacyMigrationBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LegacyMigrationBlockedError";
  }
}

export function verifyLegacyOwnerMapping(
  mapping: Partial<LegacyOwnerMapping> | undefined
): asserts mapping is LegacyOwnerMapping {
  const targetUserId = mapping?.targetUserId;
  if (
    !mapping ||
    mapping.legacyOwnerKey !== LEGACY_OWNER_KEY ||
    mapping.verified !== true ||
    typeof targetUserId !== "number" ||
    !Number.isSafeInteger(targetUserId) ||
    targetUserId <= 0 ||
    mapping.targetOwnerKey !== `user:${targetUserId}` ||
    typeof mapping.verificationSource !== "string" ||
    mapping.verificationSource.trim().length < 3
  ) {
    throw new LegacyMigrationBlockedError(
      "Legacy owner migration requires an explicitly verified user:<id> mapping."
    );
  }
}

const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function createLegacyMigrationPlan(
  inventory: LegacyInventory,
  mapping: Partial<LegacyOwnerMapping> | undefined,
  targetRecordIds: Set<string> = new Set()
): LegacyMigrationPlan {
  verifyLegacyOwnerMapping(mapping);
  const conflicts = inventory.items.filter(item =>
    targetRecordIds.has(`${item.sourceKind}:${item.recordId}`)
  );
  const bySourceKind = inventory.items.reduce<Record<string, number>>(
    (counts, item) => {
      counts[item.sourceKind] = (counts[item.sourceKind] ?? 0) + 1;
      return counts;
    },
    {}
  );
  const report: LegacyMigrationReport = {
    legacyOwnerKey: LEGACY_OWNER_KEY,
    targetOwnerKey: mapping.targetOwnerKey,
    dryRun: true,
    verified: true,
    conflictCount: conflicts.length,
    itemCount: inventory.items.length,
    bySourceKind,
    filesystemRoots: [...inventory.filesystemRoots],
    checksum: digest(inventory.items),
  };
  if (conflicts.length)
    throw new LegacyMigrationBlockedError(
      `Legacy owner migration found ${conflicts.length} target conflicts.`
    );
  return {
    runId: `migration_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    mapping,
    inventory,
    report,
  };
}

export async function runLegacyMigration(
  plan: LegacyMigrationPlan,
  backend: LegacyMigrationBackend,
  mode: "dry_run" | "apply" | "rollback"
): Promise<LegacyMigrationReport> {
  verifyLegacyOwnerMapping(plan.mapping);
  if (mode === "dry_run") return { ...plan.report, dryRun: true };
  if (mode === "rollback") {
    await backend.restore(plan);
    return { ...plan.report, dryRun: false };
  }

  // Backup must complete before any owner key or filesystem root is changed.
  await backend.backup(plan);
  try {
    await backend.rewriteOwner(plan);
    return { ...plan.report, dryRun: false };
  } catch (error) {
    await backend.restore(plan);
    throw new Error("Legacy owner migration failed and was rolled back.", {
      cause: error,
    });
  }
}
