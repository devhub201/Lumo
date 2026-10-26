import { spawn } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";
import { sanitizePublicText } from "../security/safety";
import type {
  RuntimeCommand,
  RuntimeProvider,
  RuntimeResult,
  RuntimeStatus,
  RuntimeTarget,
} from "./contracts";

const workspaceRoot = () =>
  path.resolve(
    process.env.LUMO_CODE_ROOT || path.join(process.cwd(), ".lumo-code-workspaces")
  );

export class LocalRuntimeProvider implements RuntimeProvider {
  async status(target: RuntimeTarget): Promise<RuntimeStatus> {
    return target.authorized ? "ready" : "offline";
  }

  async execute(
    target: RuntimeTarget,
    command: RuntimeCommand,
    input: { signal?: AbortSignal } = {}
  ): Promise<RuntimeResult> {
    const startedAt = Date.now();
    const executionId = nanoid(12);
    const cwd = path.resolve(command.cwd);
    const root = workspaceRoot();
    if (cwd !== root && !cwd.startsWith(`${root}${path.sep}`))
      return this.failed(executionId, target.id, "workspace_cwd_invalid", startedAt);
    if (input.signal?.aborted)
      return this.cancelled(executionId, target.id, startedAt, "Runtime command cancelled.");

    if (command.kind === "status")
      return this.completed(executionId, target.id, startedAt, `${target.displayName}: ready`, "");
    if (command.kind === "pwd")
      return this.completed(executionId, target.id, startedAt, cwd, "");
    if (command.kind === "echo")
      return this.completed(executionId, target.id, startedAt, command.args[0] ?? "", "");
    if (command.kind === "list") {
      try {
        const entries = await readdir(cwd);
        return this.completed(executionId, target.id, startedAt, `${entries.join("\n")}\n`, "");
      } catch {
        return this.failed(executionId, target.id, "workspace_list_failed", startedAt);
      }
    }

    const script =
      command.kind === "project_test"
        ? "test"
        : command.kind === "project_build"
          ? "build"
          : "lint";
    let packageJson: { scripts?: Record<string, unknown> };
    try {
      packageJson = JSON.parse(await readFile(path.join(cwd, "package.json"), "utf8")) as typeof packageJson;
    } catch {
      return this.failed(executionId, target.id, "package_manifest_missing", startedAt);
    }
    if (typeof packageJson.scripts?.[script] !== "string")
      return this.failed(executionId, target.id, `script_${script}_missing`, startedAt);

    return new Promise(resolve => {
      const child = spawn("pnpm", [script], {
        cwd,
        env: { ...process.env, CI: "1" },
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      const append = (targetBuffer: "stdout" | "stderr", chunk: Buffer) => {
        const value = chunk.toString("utf8");
        if (targetBuffer === "stdout") stdout = `${stdout}${value}`.slice(-command.maxOutputChars);
        else stderr = `${stderr}${value}`.slice(-command.maxOutputChars);
      };
      child.stdout.on("data", chunk => append("stdout", chunk));
      child.stderr.on("data", chunk => append("stderr", chunk));
      let settled = false;
      const finish = (result: RuntimeResult) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };
      const timer = setTimeout(() => {
        child.kill("SIGTERM");
        finish({
          executionId,
          targetId: target.id,
          state: "failed",
          stdout: sanitizePublicText(stdout).slice(0, command.maxOutputChars),
          stderr: sanitizePublicText(`${stderr}\nExecution timed out.`).slice(0, command.maxOutputChars),
          exitCode: null,
          durationMs: Date.now() - startedAt,
          resourceMetadata: { provider: target.provider, error: "timeout", untrusted: "true" },
        });
      }, command.timeoutMs);
      input.signal?.addEventListener("abort", () => {
        child.kill("SIGTERM");
        clearTimeout(timer);
        finish({
          executionId,
          targetId: target.id,
          state: "cancelled",
          stdout: sanitizePublicText(stdout).slice(0, command.maxOutputChars),
          stderr: sanitizePublicText(stderr).slice(0, command.maxOutputChars),
          exitCode: null,
          durationMs: Date.now() - startedAt,
          resourceMetadata: { provider: target.provider, error: "cancelled", untrusted: "true" },
        });
      }, { once: true });
      child.on("error", error => {
        clearTimeout(timer);
        finish({
          executionId,
          targetId: target.id,
          state: "failed",
          stdout: sanitizePublicText(stdout).slice(0, command.maxOutputChars),
          stderr: sanitizePublicText(`${stderr}\n${error.message}`).slice(0, command.maxOutputChars),
          exitCode: null,
          durationMs: Date.now() - startedAt,
          resourceMetadata: { provider: target.provider, error: "process_start_failed", untrusted: "true" },
        });
      });
      child.on("close", code => {
        clearTimeout(timer);
        finish({
          executionId,
          targetId: target.id,
          state: code === 0 ? "completed" : "failed",
          stdout: sanitizePublicText(stdout).slice(0, command.maxOutputChars),
          stderr: sanitizePublicText(stderr).slice(0, command.maxOutputChars),
          exitCode: code,
          durationMs: Date.now() - startedAt,
          resourceMetadata: { provider: target.provider, script, untrusted: "true" },
        });
      });
    });
  }

  private completed(id: string, targetId: string, startedAt: number, stdout: string, stderr: string): RuntimeResult {
    return {
      executionId: id,
      targetId,
      state: "completed",
      stdout: sanitizePublicText(stdout),
      stderr: sanitizePublicText(stderr),
      exitCode: 0,
      durationMs: Date.now() - startedAt,
      resourceMetadata: { provider: "local-workspace", untrusted: "true" },
    };
  }

  private failed(id: string, targetId: string, error: string, startedAt: number): RuntimeResult {
    return {
      executionId: id,
      targetId,
      state: "failed",
      stdout: "",
      stderr: "Local workspace execution was not performed.",
      exitCode: null,
      durationMs: Date.now() - startedAt,
      resourceMetadata: { provider: "local-workspace", error },
    };
  }

  private cancelled(id: string, targetId: string, startedAt: number, stderr: string): RuntimeResult {
    return {
      executionId: id,
      targetId,
      state: "cancelled",
      stdout: "",
      stderr,
      exitCode: null,
      durationMs: Date.now() - startedAt,
      resourceMetadata: { provider: "local-workspace", error: "cancelled" },
    };
  }
}
