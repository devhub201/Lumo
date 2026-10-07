import type { ToolPermission, ToolPermissionChecker } from "./contracts";

export class AllowlistToolPermissions implements ToolPermissionChecker {
  private readonly allowed = new Set<string>();

  constructor(allowedPermissions: ToolPermission[] = []) {
    for (const permission of allowedPermissions) this.allowed.add(permission);
  }

  allow(permission: ToolPermission) {
    this.allowed.add(permission);
  }

  revoke(permission: ToolPermission) {
    this.allowed.delete(permission);
  }

  async canUse(_ownerKey: string, permission: ToolPermission) {
    return this.allowed.has(permission);
  }
}

export class DenyAllToolPermissions implements ToolPermissionChecker {
  async canUse(_ownerKey: string, _permission: ToolPermission) {
    return false;
  }
}
