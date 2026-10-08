import { z } from "zod";
export const permissionCapabilitySchema = z.enum([
  "microphone",
  "camera",
  "files",
  "web_access",
  "external_integrations",
  "terminal_runtime",
  "account_services",
  "memory_access",
  "memory_write",
  "sensitive_actions",
]);
export type PermissionCapability = z.infer<typeof permissionCapabilitySchema>;
export const permissionStateSchema = z.enum([
  "unknown",
  "granted",
  "denied",
  "restricted",
]);
export type PermissionState = z.infer<typeof permissionStateSchema>;
export type PermissionScope = {
  ownerKey: string;
  resource?: string;
  action?: string;
};
export type PermissionRecord = {
  id: string;
  capability: PermissionCapability;
  scope: PermissionScope;
  state: PermissionState;
  reason: string;
  source: "user" | "system" | "provider";
  updatedAt: number;
};
export type PermissionDecision = {
  allowed: boolean;
  record: PermissionRecord | null;
  reason: string;
};
export class PermissionManager {
  private records = new Map<string, PermissionRecord>();
  private key(
    ownerKey: string,
    capability: PermissionCapability,
    resource = "*"
  ) {
    return `${ownerKey}:${capability}:${resource}`;
  }
  set(input: Omit<PermissionRecord, "updatedAt">) {
    const record = { ...input, updatedAt: Date.now() };
    this.records.set(
      this.key(input.scope.ownerKey, input.capability, input.scope.resource),
      record
    );
    return record;
  }
  get(ownerKey: string, capability: PermissionCapability, resource = "*") {
    return this.records.get(this.key(ownerKey, capability, resource)) ?? null;
  }
  evaluate(
    ownerKey: string,
    capability: PermissionCapability,
    resource = "*"
  ): PermissionDecision {
    const record =
      this.get(ownerKey, capability, resource) ??
      this.get(ownerKey, capability);
    if (!record)
      return { allowed: false, record: null, reason: "Permission is unknown." };
    return {
      allowed: record.state === "granted",
      record,
      reason:
        record.state === "granted"
          ? "Permission granted."
          : `Permission is ${record.state}.`,
    };
  }
  grant(
    ownerKey: string,
    capability: PermissionCapability,
    reason = "Explicitly granted",
    resource = "*",
    source: PermissionRecord["source"] = "user"
  ) {
    return this.set({
      id: `perm_${ownerKey}_${capability}_${resource}`,
      capability,
      scope: { ownerKey, resource },
      state: "granted",
      reason,
      source,
    });
  }
  deny(
    ownerKey: string,
    capability: PermissionCapability,
    reason = "Permission denied",
    resource = "*",
    source: PermissionRecord["source"] = "user"
  ) {
    return this.set({
      id: `perm_${ownerKey}_${capability}_${resource}`,
      capability,
      scope: { ownerKey, resource },
      state: "denied",
      reason,
      source,
    });
  }
}
const TOOL_CAPABILITY: Record<string, PermissionCapability> = {
  microphone: "microphone",
  camera: "camera",
  files: "files",
  network: "web_access",
  vision: "camera",
  blueprint: "memory_access",
  teaching: "camera",
  external: "external_integrations",
};
export const capabilityForToolPermission = (
  permission: string
): PermissionCapability => TOOL_CAPABILITY[permission] ?? "sensitive_actions";
