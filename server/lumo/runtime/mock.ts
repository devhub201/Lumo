import { nanoid } from "nanoid";
import type {
  RuntimeCommand,
  RuntimeProvider,
  RuntimeResult,
  RuntimeStatus,
  RuntimeTarget,
} from "./contracts";
import { sanitizePublicText } from "../security/safety";
export class MockRuntimeProvider implements RuntimeProvider {
  async status(target: RuntimeTarget): Promise<RuntimeStatus> {
    return target.authorized ? "ready" : "offline";
  }
  async execute(
    target: RuntimeTarget,
    command: RuntimeCommand,
    input: { signal?: AbortSignal } = {}
  ): Promise<RuntimeResult> {
    const started = Date.now();
    const id = nanoid(12);
    if (input.signal?.aborted)
      return {
        executionId: id,
        targetId: target.id,
        state: "cancelled",
        stdout: "",
        stderr: "Runtime command cancelled.",
        exitCode: null,
        durationMs: 0,
        resourceMetadata: { provider: target.provider },
      };
    let stdout = "";
    let stderr = "";
    let exitCode = 0;
    switch (command.kind) {
      case "status":
        stdout = `${target.displayName}: ready`;
        break;
      case "pwd":
        stdout = command.cwd;
        break;
      case "echo":
        stdout = command.args[0] ?? "";
        break;
      case "list":
        stdout = "workspace\n";
        break;
      case "project_test":
        stdout = `Controlled test operation prepared for ${command.args[0] ?? "project"}.`;
        break;
      case "project_build":
        stdout = `Controlled build operation prepared for ${command.args[0] ?? "project"}.`;
        break;
      case "project_lint":
        stdout = `Controlled lint operation prepared for ${command.args[0] ?? "project"}.`;
        break;
      default:
        stderr = "Unsupported runtime command.";
        exitCode = 2;
    }
    stdout = sanitizePublicText(stdout).slice(0, command.maxOutputChars);
    stderr = sanitizePublicText(stderr).slice(0, command.maxOutputChars);
    return {
      executionId: id,
      targetId: target.id,
      state: exitCode === 0 ? "completed" : "failed",
      stdout,
      stderr,
      exitCode,
      durationMs: Date.now() - started,
      resourceMetadata: { provider: target.provider, untrusted: "true" },
    };
  }
}
