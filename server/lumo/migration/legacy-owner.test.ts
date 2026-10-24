import { describe, expect, it } from "vitest";
import {
  createLegacyMigrationPlan,
  LegacyMigrationBlockedError,
  runLegacyMigration,
} from "./legacy-owner";

const inventory = {
  generatedAt: "2026-10-12T00:00:00.000Z",
  filesystemRoots: ["/var/lib/lumo/peter"],
  items: [
    { sourceKind: "conversation" as const, recordId: "c1", checksum: "a" },
    { sourceKind: "message" as const, recordId: "m1", checksum: "b" },
    { sourceKind: "file" as const, recordId: "f1", checksum: "c", bytes: 4 },
  ],
};
const mapping = {
  legacyOwnerKey: "peter" as const,
  targetOwnerKey: "user:42" as const,
  targetUserId: 42,
  verified: true as const,
  verificationSource: "verified users.id=42 by operator ticket SEC-42",
};

describe("legacy owner migration safety", () => {
  it("blocks missing or guessed identity mappings", () => {
    expect(() => createLegacyMigrationPlan(inventory, undefined)).toThrow(
      LegacyMigrationBlockedError
    );
    expect(() =>
      createLegacyMigrationPlan(inventory, {
        ...mapping,
        verified: false,
      })
    ).toThrow(LegacyMigrationBlockedError);
  });

  it("produces a complete dry-run report without changing records", async () => {
    const plan = createLegacyMigrationPlan(inventory, mapping);
    const calls: string[] = [];
    const report = await runLegacyMigration(
      plan,
      {
        backup: async () => calls.push("backup"),
        rewriteOwner: async () => calls.push("rewrite"),
        restore: async () => calls.push("restore"),
      },
      "dry_run"
    );
    expect(report).toMatchObject({
      dryRun: true,
      verified: true,
      itemCount: 3,
      conflictCount: 0,
      targetOwnerKey: "user:42",
    });
    expect(calls).toEqual([]);
  });

  it("detects target conflicts before apply", () => {
    expect(() =>
      createLegacyMigrationPlan(inventory, mapping, new Set(["message:m1"]))
    ).toThrow("target conflicts");
  });

  it("backs up before rewrite and restores after a failed apply", async () => {
    const plan = createLegacyMigrationPlan(inventory, mapping);
    const calls: string[] = [];
    await expect(
      runLegacyMigration(
        plan,
        {
          backup: async () => calls.push("backup"),
          rewriteOwner: async () => {
            calls.push("rewrite");
            throw new Error("simulated failure");
          },
          restore: async () => calls.push("restore"),
        },
        "apply"
      )
    ).rejects.toThrow("rolled back");
    expect(calls).toEqual(["backup", "rewrite", "restore"]);
  });
});
