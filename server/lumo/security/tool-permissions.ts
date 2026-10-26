import type { ToolPermission, ToolPermissionChecker } from "../tools/contracts";
import { capabilityForToolPermission, PermissionManager } from "./permissions";
export class ManagedToolPermissions implements ToolPermissionChecker {
  private readonly defaults: ToolPermission[];

  constructor(
    public readonly manager: PermissionManager,
    defaults: ToolPermission[] = []
  ) {
    this.defaults = [...defaults];
  }

  private ensureDefaults(ownerKey: string) {
    for (const permission of this.defaults) {
      const capability = capabilityForToolPermission(permission);
      if (!this.manager.get(ownerKey, capability))
        this.manager.grant(
          ownerKey,
          capability,
          "Existing LUMO tool allowlist",
          "*",
          "system"
        );
    }
  }
  async canUse(ownerKey: string, permission: ToolPermission) {
    this.ensureDefaults(ownerKey);
    return this.manager.evaluate(
      ownerKey,
      capabilityForToolPermission(permission)
    ).allowed;
  }
  async explain(ownerKey: string, permission: ToolPermission) {
    this.ensureDefaults(ownerKey);
    const decision = this.manager.evaluate(
      ownerKey,
      capabilityForToolPermission(permission)
    );
    return { allowed: decision.allowed, reason: decision.reason };
  }
}
