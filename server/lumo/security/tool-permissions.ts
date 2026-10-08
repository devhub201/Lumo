import type { ToolPermission, ToolPermissionChecker } from "../tools/contracts";
import { capabilityForToolPermission, PermissionManager } from "./permissions";
export class ManagedToolPermissions implements ToolPermissionChecker {
  constructor(
    public readonly manager: PermissionManager,
    defaults: ToolPermission[] = []
  ) {
    for (const permission of defaults)
      manager.grant(
        "peter",
        capabilityForToolPermission(permission),
        "Existing LUMO tool allowlist",
        "*",
        "system"
      );
  }
  async canUse(ownerKey: string, permission: ToolPermission) {
    return this.manager.evaluate(
      ownerKey,
      capabilityForToolPermission(permission)
    ).allowed;
  }
  async explain(ownerKey: string, permission: ToolPermission) {
    const decision = this.manager.evaluate(
      ownerKey,
      capabilityForToolPermission(permission)
    );
    return { allowed: decision.allowed, reason: decision.reason };
  }
}
