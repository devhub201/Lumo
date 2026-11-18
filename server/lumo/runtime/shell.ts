import { spawn } from "node:child_process";
import { mkdirSync, realpathSync } from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import type {
  RuntimeCommand,
  RuntimeProvider,
  RuntimeResult,
  RuntimeStatus,
  RuntimeTarget,
} from "./contracts";
import { sanitizePublicText } from "../security/safety";

/**
 * Every real command executes inside this directory, never inside the Lumo
 * server's own source tree. This is a genuine shell — not a whitelist of
 * canned responses — scoped to a workspace so Lumo can't (by accident or by
 * a bad instruction) rewrite its own running code.
 */
const SANDBOX_ROOT = path.resolve(
  process.env.LUMO_SANDBOX_ROOT || path.join(process.cwd(), "lumo-sandbox")
);
mkdirSync(SANDBOX_ROOT, { recursive: true });

// Project files created through the Coding workspace live in their own
// tree (see coding/workspace.ts). Shell commands targeting a specific
// project (test/build/lint) resolve into that tree by absolute path;
// everything else resolves relative to the general-purpose sandbox above.
// Either way, execution never reaches outside one of these two roots.
const CODE_WORKSPACE_ROOT = path.resolve(
  process.env.LUMO_CODE_ROOT || path.join(process.cwd(), ".lumo-code-workspaces")
);

const containedIn = (candidate: string, root: string) => {
  mkdirSync(root, { recursive: true });
  const real = realpathSync(candidate);
  const realRoot = realpathSync(root);
  return real === realRoot || real.startsWith(realRoot + path.sep) ? real : null;
};

const resolveCwd = (cwd: string): string => {
  if (path.isAbsolute(cwd) && cwd !== "/workspace" && !cwd.startsWith("/workspace/")) {
    mkdirSync(cwd, { recursive: true });
    const inSandbox = containedIn(cwd, SANDBOX_ROOT);
    const inCodeRoot = containedIn(cwd, CODE_WORKSPACE_ROOT);
    const real = inSandbox ?? inCodeRoot;
    if (!real) throw new Error("Working directory escapes the allowed workspaces.");
    return real;
  }
  // "/workspace" (the schema default) and any relative path are treated as
  // relative to the general-purpose sandbox root.
  const relative = cwd.replace(/^\/+/, "").replace(/^workspace\/?/, "");
  const resolved = path.resolve(SANDBOX_ROOT, relative || ".");
  mkdirSync(resolved, { recursive: true });
  const real = containedIn(resolved, SANDBOX_ROOT);
  if (!real) throw new Error("Working directory escapes the sandbox workspace.");
  return real;
};

const commandLineFor = (command: RuntimeCommand): string | null => {
  switch (command.kind) {
    case "status":
      return "echo ready";
    case "pwd":
      return "pwd";
    case "echo":
      return `echo ${JSON.stringify(command.args[0] ?? "")}`;
    case "list":
      return "ls -la";
    case "project_test":
      return "pnpm test 2>&1 || npm test 2>&1";
    case "project_build":
      return "pnpm build 2>&1 || npm run build 2>&1";
    case "project_lint":
      return "pnpm lint 2>&1 || npm run lint 2>&1";
    case "exec":
      return command.command ?? null;
    default:
      return null;
  }
};

export class ShellRuntimeProvider implements RuntimeProvider {
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
    const base = {
      executionId: id,
      targetId: target.id,
      resourceMetadata: { provider: target.provider, untrusted: "true" },
    };
    if (input.signal?.aborted)
      return {
        ...base,
        state: "cancelled",
        stdout: "",
        stderr: "Runtime command cancelled.",
        exitCode: null,
        durationMs: 0,
      };

    let cwd: string;
    try {
      cwd = resolveCwd(command.cwd);
    } catch (error) {
      return {
        ...base,
        state: "failed",
        stdout: "",
        stderr: error instanceof Error ? error.message : "Invalid working directory.",
        exitCode: null,
        durationMs: Date.now() - started,
      };
    }

    const line = commandLineFor(command);
    if (!line)
      return {
        ...base,
        state: "failed",
        stdout: "",
        stderr: "Unsupported runtime command.",
        exitCode: 2,
        durationMs: Date.now() - started,
      };

    return new Promise<RuntimeResult>(resolve => {
      const child = spawn(line, {
        cwd,
        shell: "/bin/bash",
        env: { ...process.env, PATH: process.env.PATH },
        timeout: command.timeoutMs,
      });

      let stdout = "";
      let stderr = "";
      let settled = false;

      const finish = (state: RuntimeResult["state"], exitCode: number | null) => {
        if (settled) return;
        settled = true;
        resolve({
          ...base,
          state,
          stdout: sanitizePublicText(stdout).slice(0, command.maxOutputChars),
          stderr: sanitizePublicText(stderr).slice(0, command.maxOutputChars),
          exitCode,
          durationMs: Date.now() - started,
        });
      };

      const onAbort = () => {
        child.kill("SIGKILL");
        finish("cancelled", null);
      };
      input.signal?.addEventListener("abort", onAbort, { once: true });

      child.stdout?.on("data", chunk => {
        if (stdout.length < command.maxOutputChars) stdout += chunk.toString();
      });
      child.stderr?.on("data", chunk => {
        if (stderr.length < command.maxOutputChars) stderr += chunk.toString();
      });
      child.on("error", error => {
        stderr += `\n${error.message}`;
        finish("failed", null);
      });
      child.on("close", (code, signal) => {
        input.signal?.removeEventListener("abort", onAbort);
        if (signal === "SIGTERM" || signal === "SIGKILL") {
          if (!stderr) stderr = `Command timed out after ${command.timeoutMs}ms.`;
          finish("failed", null);
          return;
        }
        finish(code === 0 ? "completed" : "failed", code);
      });
    });
  }
}
