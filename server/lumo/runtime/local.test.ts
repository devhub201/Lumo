import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PermissionManager } from "../security/permissions";
import { InMemorySensitiveGrantStore, SensitiveGrantService } from "../security/grants";
import { createCodeWorkspace } from "../coding/workspace";
import { CodingTaskManager } from "../coding/tasks";
import { LocalRuntimeProvider } from "./local";
import { RuntimeManager } from "./manager";

describe("local coding runtime", () => {
  it("executes an allowlisted package test and returns actual output", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "lumo-p2-"));
    const previous = process.env.LUMO_CODE_ROOT;
    process.env.LUMO_CODE_ROOT = root;
    try {
      const permissions = new PermissionManager();
      permissions.grant("user:1", "files");
      permissions.grant("user:1", "terminal_runtime");
      const workspace = createCodeWorkspace(permissions);
      const project = await workspace.createProject("user:1", "demo");
      await workspace.writeFile(
        "user:1",
        project.id,
        "package.json",
        JSON.stringify({ scripts: { test: "node -p 1" } }),
        "create"
      );
      const grants = new SensitiveGrantService(new InMemorySensitiveGrantStore());
      const runtime = new RuntimeManager(permissions, new LocalRuntimeProvider(), grants);
      runtime.register({
        id: "local-mock",
        provider: "local",
        displayName: "Local workspace",
        connectionState: "ready",
        capabilities: ["shell"],
        authorized: true,
        metadata: {},
      });
      const taskManager = new CodingTaskManager(permissions, runtime, workspace);
      const task = taskManager.create("user:1", project.id, "request-1");
      const authorization = await grants.issue("user:1", "runtime_command", "local-mock");
      const result = await taskManager.run(task, "test", "user:1", authorization);
      expect(result).toMatchObject({ passed: true, tests: 1 });
    } finally {
      if (previous === undefined) delete process.env.LUMO_CODE_ROOT;
      else process.env.LUMO_CODE_ROOT = previous;
      await rm(root, { recursive: true, force: true });
    }
  });
});
