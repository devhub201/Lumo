import { createHash, randomUUID } from "node:crypto";
import type { SensitiveActionAuthorization } from "./safety";
import { lumoAudit, type AuditLog } from "./audit";

/**
 * Server-issued approvals for sensitive actions.
 *
 * The client can no longer assert `authorized: true`. Instead:
 *   1. request()  — the server records the exact action + payload hash.
 *   2. decide()   — the signed-in owner approves or denies that approval.
 *   3. consume()  — the sensitive procedure recomputes the payload hash from
 *                   the real request and burns the approval (single use).
 *
 * An approval is bound to: the owner, the action name, the payload hash, a
 * short expiry, and a single use. Changing even one byte of the email body or
 * runtime command invalidates it.
 *
 * Limitation (documented): decide() is still an authenticated API call. Phase 2
 * binds it to an explicit on-device confirmation (and biometric where set up).
 */
export const SENSITIVE_ACTIONS = ["gmail.send", "runtime_command"] as const;
export type SensitiveAction = (typeof SENSITIVE_ACTIONS)[number];

export type ApprovalErrorCode =
  | "approval_invalid"
  | "approval_not_approved"
  | "approval_expired"
  | "approval_already_used"
  | "approval_mismatch"
  | "approval_limit";

export class ApprovalError extends Error {
  constructor(
    readonly code: ApprovalErrorCode,
    message: string
  ) {
    super(message);
    this.name = "ApprovalError";
  }
}

export type ApprovalStatus = "pending" | "approved" | "denied" | "consumed";

type StoredApproval = {
  id: string;
  ownerKey: string;
  action: SensitiveAction;
  summary: string;
  payloadHash: string;
  status: ApprovalStatus;
  createdAt: number;
  expiresAt: number;
  decidedAt?: number;
};

export type PublicApproval = Omit<StoredApproval, "ownerKey" | "payloadHash"> & {
  payloadHash: string;
};

const stable = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, stable(v)])
    );
  }
  return value;
};

/** SHA-256 over key-sorted canonical JSON, so field order never matters. */
export const hashPayload = (action: string, payload: unknown) =>
  createHash("sha256")
    .update(JSON.stringify({ action, payload: stable(payload) }))
    .digest("hex");

export class ApprovalService {
  private readonly approvals = new Map<string, StoredApproval>();
  private readonly ttlMs: number;
  private readonly maxPerOwner: number;
  private readonly now: () => number;
  private readonly audit: AuditLog;

  constructor(
    options: {
      ttlMs?: number;
      maxPerOwner?: number;
      now?: () => number;
      audit?: AuditLog;
    } = {}
  ) {
    this.ttlMs = options.ttlMs ?? 5 * 60_000;
    this.maxPerOwner = options.maxPerOwner ?? 50;
    this.now = options.now ?? Date.now;
    this.audit = options.audit ?? lumoAudit;
  }

  request(
    ownerKey: string,
    input: { action: SensitiveAction; summary: string; payload: unknown }
  ): PublicApproval {
    this.sweep();
    const live = [...this.approvals.values()].filter(
      a => a.ownerKey === ownerKey && (a.status === "pending" || a.status === "approved")
    );
    if (live.length >= this.maxPerOwner)
      throw new ApprovalError("approval_limit", "Too many open approvals.");
    const now = this.now();
    const record: StoredApproval = {
      id: randomUUID(),
      ownerKey,
      action: input.action,
      summary: input.summary.slice(0, 300),
      payloadHash: hashPayload(input.action, input.payload),
      status: "pending",
      createdAt: now,
      expiresAt: now + this.ttlMs,
    };
    this.approvals.set(record.id, record);
    this.audit.record({
      type: "approval.requested",
      ownerKey,
      action: input.action,
      approvalId: record.id,
      outcome: "ok",
    });
    return this.view(record);
  }

  decide(ownerKey: string, id: string, decision: "approve" | "deny"): PublicApproval {
    const record = this.owned(ownerKey, id);
    if (this.isExpired(record))
      throw new ApprovalError("approval_expired", "Approval expired.");
    if (record.status !== "pending")
      throw new ApprovalError("approval_already_used", "Approval already decided.");
    record.status = decision === "approve" ? "approved" : "denied";
    record.decidedAt = this.now();
    this.audit.record({
      type: decision === "approve" ? "approval.approved" : "approval.denied",
      ownerKey,
      action: record.action,
      approvalId: id,
      outcome: decision === "approve" ? "ok" : "denied",
    });
    return this.view(record);
  }

  /**
   * Validates and burns an approval. The returned authorization object is built
   * here, on the server; callers must never accept one from the client.
   */
  consume(
    ownerKey: string,
    id: string,
    action: SensitiveAction,
    payload: unknown
  ): SensitiveActionAuthorization {
    try {
      const record = this.owned(ownerKey, id);
      if (this.isExpired(record))
        throw new ApprovalError("approval_expired", "Approval expired.");
      if (record.status === "consumed")
        throw new ApprovalError("approval_already_used", "Approval already used.");
      if (record.status !== "approved")
        throw new ApprovalError("approval_not_approved", "Approval is not approved.");
      if (
        record.action !== action ||
        record.payloadHash !== hashPayload(action, payload)
      )
        throw new ApprovalError(
          "approval_mismatch",
          "Approval does not match this exact action."
        );
      record.status = "consumed";
      this.audit.record({
        type: "approval.consumed",
        ownerKey,
        action,
        approvalId: id,
        outcome: "ok",
      });
      return {
        authorized: true,
        action,
        reason: `server-approved:${id}`,
        issuedAt: this.now(),
      };
    } catch (error) {
      if (error instanceof ApprovalError) {
        this.audit.record({
          type: "approval.rejected",
          ownerKey,
          action,
          approvalId: id,
          outcome: "invalid",
          detail: error.code,
        });
      }
      throw error;
    }
  }

  list(ownerKey: string): PublicApproval[] {
    this.sweep();
    return [...this.approvals.values()]
      .filter(a => a.ownerKey === ownerKey && a.status !== "consumed")
      .map(a => this.view(a));
  }

  private owned(ownerKey: string, id: string): StoredApproval {
    const record = this.approvals.get(id);
    // Same error for "missing" and "someone else's" so ids cannot be probed.
    if (!record || record.ownerKey !== ownerKey)
      throw new ApprovalError("approval_invalid", "Approval not found.");
    return record;
  }

  private isExpired(record: StoredApproval) {
    return this.now() >= record.expiresAt;
  }

  private view(record: StoredApproval): PublicApproval {
    const { ownerKey: _owner, ...rest } = record;
    return rest;
  }

  private sweep() {
    const cutoff = this.now() - this.ttlMs;
    for (const [id, record] of this.approvals) {
      if (record.expiresAt <= cutoff) this.approvals.delete(id);
    }
  }
}

export const lumoApprovals = new ApprovalService();

export const describeApproval = (
  action: SensitiveAction,
  payload: Record<string, unknown>
): string => {
  if (action === "gmail.send") {
    const to = Array.isArray(payload.to) ? (payload.to as string[]).join(", ") : "";
    return `Send email to ${to.slice(0, 120)} with subject "${String(payload.subject ?? "").slice(0, 80)}"`;
  }
  return `Run runtime command on target "${String(payload.targetId ?? "").slice(0, 60)}"`;
};
