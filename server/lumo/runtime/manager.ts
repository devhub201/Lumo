import { nanoid } from "nanoid";
import type { PermissionManager } from "../security/permissions";
import { requireSensitiveAuthorization } from "../security/safety";
import {
  runtimeCommandSchema,
  runtimeTargetSchema,
  type RuntimeCommand,
  type RuntimeProvider,
  type RuntimeResult,
  type RuntimeTarget,
} from "./contracts";
export class RuntimeManager {
  private targets = new Map<string, RuntimeTarget>();
  constructor(
    private readonly permissions: PermissionManager,
    private readonly provider: RuntimeProvider
  ) {}
  register(target: RuntimeTarget) {
    const parsed = runtimeTargetSchema.parse(target);
    this.targets.set(parsed.id, parsed);
    return parsed;
  }
  list() {
    return [...this.targets.values()].map(target => ({
      ...target,
      metadata: { ...target.metadata, authorization: "explicit-only" },
    }));
  }
  async execute(input: {
    targetId: string;
    command: unknown;
    ownerKey: string;
    authorization?: {
      authorized: boolean;
      action: string;
      reason: string;
      issuedAt: number;
    };
    signal?: AbortSignal;
  }): Promise<RuntimeResult> {
    const target = this.targets.get(input.targetId);
    if (!target)
      return {
        executionId: nanoid(12),
        targetId: input.targetId,
        state: "failed",
        stdout: "",
        stderr: "Runtime target unavailable.",
        exitCode: null,
        durationMs: 0,
        resourceMetadata: { error: "runtime_unavailable" },
      };
    const command = runtimeCommandSchema.safeParse(input.command);
    if (!command.success)
      return {
        executionId: nanoid(12),
        targetId: target.id,
        state: "failed",
        stdout: "",
        stderr: "Command validation failed.",
        exitCode: null,
        durationMs: 0,
        resourceMetadata: { error: "command_validation" },
      };
    if (
      !target.authorized ||
      !this.permissions.evaluate(input.ownerKey, "terminal_runtime").allowed ||
      !requireSensitiveAuthorization(input.authorization, "runtime_command")
    )
      return {
        executionId: nanoid(12),
        targetId: target.id,
        state: "failed",
        stdout: "",
        stderr: "Runtime authorization required.",
        exitCode: null,
        durationMs: 0,
        resourceMetadata: { error: "authorization_required" },
      };
    const capability =
      command.data.kind === "status" ||
      command.data.kind === "pwd" ||
      command.data.kind === "echo" ||
      command.data.kind === "list" ||
      command.data.kind === "project_test" ||
      command.data.kind === "project_build" ||
      command.data.kind === "project_lint"
        ? "shell"
        : null;
    if (!capability || !target.capabilities.includes(capability))
      return {
        executionId: nanoid(12),
        targetId: target.id,
        state: "failed",
        stdout: "",
        stderr: "Runtime capability is unavailable.",
        exitCode: null,
        durationMs: 0,
        resourceMetadata: { error: "unsupported_request" },
      };
    return this.provider.execute(target, command.data, {
      signal: input.signal,
    });
  }
}
