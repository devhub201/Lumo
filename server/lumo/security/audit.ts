import { lumoLogger } from "../logger";

export type AuditEvent = {
  at: number;
  type:
    | "approval.requested"
    | "approval.approved"
    | "approval.denied"
    | "approval.consumed"
    | "approval.rejected";
  ownerKey: string;
  action: string;
  approvalId?: string;
  outcome: "ok" | "denied" | "invalid";
  detail?: string;
};

/**
 * Bounded in-memory audit trail for Phase 1. Entries are metadata only (no
 * message bodies, no payloads). A persistent, append-only table replaces this
 * in a later phase; callers only depend on `record` and `recent`.
 */
export class AuditLog {
  private readonly events: AuditEvent[] = [];
  constructor(private readonly limit = 1000) {}

  record(event: Omit<AuditEvent, "at"> & { at?: number }) {
    const entry: AuditEvent = { ...event, at: event.at ?? Date.now() };
    this.events.push(entry);
    if (this.events.length > this.limit) this.events.shift();
    lumoLogger.info("audit_event", {
      type: entry.type,
      action: entry.action,
      outcome: entry.outcome,
    });
    return entry;
  }

  recent(ownerKey: string, limit = 50): AuditEvent[] {
    return this.events
      .filter(event => event.ownerKey === ownerKey)
      .slice(-Math.max(1, Math.min(limit, 200)))
      .reverse();
  }
}

export const lumoAudit = new AuditLog();
