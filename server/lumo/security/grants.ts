import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { lumoActionAudits, lumoActionGrants } from "../../../drizzle/schema";
import { getDb } from "../../db";

export type SensitiveActionAuthorization = {
  grantToken: string;
  action: string;
  resource?: string | null;
};

export const SENSITIVE_ACTIONS = [
  "gmail.send",
  "github.create_branch",
  "github.update_file",
  "github.create_commit",
  "github.create_pull_request",
  "github.create_issue",
  "runtime_command",
  "delete_workspace_file",
  "delete_file",
] as const;
const sensitiveActionSet = new Set<string>(SENSITIVE_ACTIONS);

export type GrantOutcome =
  | "issued"
  | "consumed"
  | "rejected"
  | "expired"
  | "replayed";

export type GrantRecord = {
  id: string;
  ownerKey: string;
  action: string;
  resourceHash: string | null;
  tokenHash: string;
  nonce: string;
  expiresAt: Date;
  consumedAt: Date | null;
};

export interface SensitiveGrantStore {
  insert(record: GrantRecord): Promise<void>;
  consume(input: {
    ownerKey: string;
    action: string;
    resourceHash: string | null;
    tokenHash: string;
    now: Date;
  }): Promise<"consumed" | "missing" | "expired" | "replayed">;
  audit(input: {
    ownerKey: string;
    action: string;
    resourceHash: string | null;
    grantId?: string | null;
    outcome: GrantOutcome;
    reason: string;
  }): Promise<void>;
}

const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");

export const canonicalResource = (resource?: string | null) =>
  resource == null ? null : resource.trim().slice(0, 500);

export class DatabaseSensitiveGrantStore implements SensitiveGrantStore {
  async insert(record: GrantRecord) {
    const db = await getDb();
    if (!db) throw new Error("Grant database is unavailable.");
    await db.insert(lumoActionGrants).values({
      id: record.id,
      ownerKey: record.ownerKey,
      action: record.action,
      resourceHash: record.resourceHash,
      tokenHash: record.tokenHash,
      nonce: record.nonce,
      expiresAt: record.expiresAt,
    });
  }

  async consume(input: {
    ownerKey: string;
    action: string;
    resourceHash: string | null;
    tokenHash: string;
    now: Date;
  }) {
    const db = await getDb();
    if (!db) return "missing" as const;
    const rows = await db
      .select({
        id: lumoActionGrants.id,
        expiresAt: lumoActionGrants.expiresAt,
        consumedAt: lumoActionGrants.consumedAt,
      })
      .from(lumoActionGrants)
      .where(
        and(
          eq(lumoActionGrants.ownerKey, input.ownerKey),
          eq(lumoActionGrants.action, input.action),
          eq(lumoActionGrants.tokenHash, input.tokenHash),
          input.resourceHash === null
            ? isNull(lumoActionGrants.resourceHash)
            : eq(lumoActionGrants.resourceHash, input.resourceHash)
        )
      )
      .limit(1);
    const row = rows[0];
    if (!row) return "missing" as const;
    if (row.consumedAt) return "replayed" as const;
    if (row.expiresAt <= input.now) return "expired" as const;

    const updated = await db
      .update(lumoActionGrants)
      .set({ consumedAt: input.now })
      .where(
        and(
          eq(lumoActionGrants.id, row.id),
          isNull(lumoActionGrants.consumedAt),
          gt(lumoActionGrants.expiresAt, input.now)
        )
      );
    const result = updated as unknown as { affectedRows?: number };
    return result.affectedRows === 1 ? ("consumed" as const) : ("replayed" as const);
  }

  async audit(input: {
    ownerKey: string;
    action: string;
    resourceHash: string | null;
    grantId?: string | null;
    outcome: GrantOutcome;
    reason: string;
  }) {
    const db = await getDb();
    if (!db) throw new Error("Grant database is unavailable.");
    await db.insert(lumoActionAudits).values({
      id: `audit_${randomBytes(10).toString("hex")}`,
      ownerKey: input.ownerKey,
      action: input.action,
      resourceHash: input.resourceHash,
      grantId: input.grantId ?? null,
      outcome: input.outcome,
      reason: input.reason.slice(0, 300),
    });
  }
}

export class InMemorySensitiveGrantStore implements SensitiveGrantStore {
  readonly records = new Map<string, GrantRecord>();
  readonly audits: Array<{
    ownerKey: string;
    action: string;
    resourceHash: string | null;
    grantId?: string | null;
    outcome: GrantOutcome;
    reason: string;
  }> = [];

  async insert(record: GrantRecord) {
    this.records.set(record.tokenHash, { ...record });
  }

  async consume(input: {
    ownerKey: string;
    action: string;
    resourceHash: string | null;
    tokenHash: string;
    now: Date;
  }) {
    const record = this.records.get(input.tokenHash);
    if (
      !record ||
      record.ownerKey !== input.ownerKey ||
      record.action !== input.action ||
      record.resourceHash !== input.resourceHash
    )
      return "missing" as const;
    if (record.consumedAt) return "replayed" as const;
    if (record.expiresAt <= input.now) return "expired" as const;
    record.consumedAt = input.now;
    return "consumed" as const;
  }

  async audit(input: {
    ownerKey: string;
    action: string;
    resourceHash: string | null;
    grantId?: string | null;
    outcome: GrantOutcome;
    reason: string;
  }) {
    this.audits.push(input);
  }
}

export class SensitiveGrantService {
  constructor(
    private readonly store: SensitiveGrantStore,
    private readonly now: () => Date = () => new Date(),
    private readonly ttlMs = 60_000
  ) {}

  async issue(ownerKey: string, action: string, resource?: string | null) {
    if (!sensitiveActionSet.has(action))
      throw new Error("Unsupported sensitive action.");
    const token = randomBytes(32).toString("base64url");
    const record: GrantRecord = {
      id: `grant_${randomBytes(10).toString("hex")}`,
      ownerKey,
      action: action.trim().slice(0, 120),
      resourceHash: this.resourceHash(resource),
      tokenHash: hash(token),
      nonce: randomBytes(16).toString("hex"),
      expiresAt: new Date(this.now().getTime() + this.ttlMs),
      consumedAt: null,
    };
    await this.store.insert(record);
    await this.store.audit({
      ownerKey,
      action: record.action,
      resourceHash: record.resourceHash,
      grantId: record.id,
      outcome: "issued",
      reason: "server-issued action-bound grant",
    });
    return { grantToken: token, action: record.action, resource: canonicalResource(resource), expiresAt: record.expiresAt };
  }

  async consume(
    ownerKey: string,
    authorization: SensitiveActionAuthorization | undefined,
    expectedAction: string,
    expectedResource?: string | null
  ) {
    const resourceHash = this.resourceHash(expectedResource);
    if (
      !authorization ||
      authorization.action !== expectedAction ||
      canonicalResource(authorization.resource) !== canonicalResource(expectedResource) ||
      !authorization.grantToken
    ) {
      await this.store.audit({
        ownerKey,
        action: expectedAction,
        resourceHash,
        outcome: "rejected",
        reason: "grant payload mismatch or missing token",
      });
      return false;
    }
    const result = await this.store.consume({
      ownerKey,
      action: expectedAction,
      resourceHash,
      tokenHash: hash(authorization.grantToken),
      now: this.now(),
    });
    await this.store.audit({
      ownerKey,
      action: expectedAction,
      resourceHash,
      outcome:
        result === "consumed"
          ? "consumed"
          : result === "expired"
            ? "expired"
            : result === "replayed"
              ? "replayed"
              : "rejected",
      reason: result,
    });
    return result === "consumed";
  }

  private resourceHash(resource?: string | null) {
    const canonical = canonicalResource(resource);
    return canonical === null ? null : hash(canonical);
  }
}

export const databaseSensitiveGrantService = new SensitiveGrantService(
  new DatabaseSensitiveGrantStore()
);
export const isolatedSensitiveGrantService = new SensitiveGrantService(
  new InMemorySensitiveGrantStore()
);

export const requireSensitiveAuthorization = (
  grants: SensitiveGrantService,
  ownerKey: string,
  authorization: SensitiveActionAuthorization | undefined,
  action: string,
  resource?: string | null
) => grants.consume(ownerKey, authorization, action, resource);
