import type { ToolPermission, ToolPermissionChecker } from "../tools/contracts";
import { capabilityForToolPermission, PermissionManager } from "./permissions";

/**
 * The tool-permission tags a person can actually see and flip in Settings.
 * Each one gates a real capability (ManagedToolPermissions.canUse reads the
 * PermissionManager live on every tool call) — toggling one off here
 * genuinely blocks the matching tools immediately, not cosmetically.
 * "microphone" is deliberately left out: nothing server-side currently
 * checks it, so a toggle for it would be fake.
 */
export const TOGGLEABLE_TOOL_PERMISSIONS = [
  {
    tag: "terminal",
    label: "Terminal",
    description: "Run real shell commands in Lumo's sandboxed workspace.",
  },
  {
    tag: "network",
    label: "Browser & web",
    description: "Browse, fetch pages, and click/type/select on real sites.",
  },
  {
    tag: "files",
    label: "Files & coding",
    description: "Read, write and manage workspace files and coding projects.",
  },
  {
    tag: "vision",
    label: "Vision",
    description: "Analyze images and camera captures.",
  },
  {
    tag: "camera",
    label: "Camera",
    description: "Open the device camera for a live snapshot.",
  },
  {
    tag: "blueprint",
    label: "Blueprints",
    description: "Create and edit blueprint overlays.",
  },
  {
    tag: "teaching",
    label: "Teaching",
    description: "Create and track teaching/learning sessions.",
  },
  {
    tag: "external",
    label: "GitHub & Gmail",
    description: "Access connected GitHub/Gmail integrations.",
  },
] as const satisfies ReadonlyArray<{
  tag: ToolPermission;
  label: string;
  description: string;
}>;

export type ToggleableToolPermissionTag =
  (typeof TOGGLEABLE_TOOL_PERMISSIONS)[number]["tag"];
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
