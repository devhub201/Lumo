import { nanoid } from "nanoid";
import type { RuntimeManager } from "../runtime";
import type { PermissionManager } from "../security/permissions";
import type {
  BuildResult,
  CodeTask,
  Diagnostic,
  CodeTestResult,
} from "./contracts";
export class CodingTaskManager {
  constructor(
    private readonly permissions: PermissionManager,
    private readonly runtime: RuntimeManager
  ) {}
  create(projectId: string, requestId: string): CodeTask {
    return {
      id: `task_${nanoid(10)}`,
      requestId,
      projectId,
      status: "queued",
      maxIterations: 3,
      timeoutMs: 30000,
      diagnostics: [],
      partial: false,
    };
  }
  async run(
    task: CodeTask,
    kind: "test" | "build" | "lint",
    ownerKey: string,
    authorization?: any
  ): Promise<BuildResult | CodeTestResult> {
    task.status = "testing";
    const result = await this.runtime.execute({
      targetId: "local-mock",
      ownerKey,
      command: {
        kind:
          kind === "test"
            ? "project_test"
            : kind === "build"
              ? "project_build"
              : "project_lint",
        args: [task.projectId],
        cwd: "/workspace",
        timeoutMs: Math.min(task.timeoutMs, 10000),
        maxOutputChars: 4000,
      },
      authorization,
    });
    const diagnostics: Diagnostic[] =
      result.state === "completed"
        ? []
        : [
            {
              severity: "error",
              message: result.stderr,
              code: result.resourceMetadata.error,
            },
          ];
    task.status = result.state === "completed" ? "completed" : "failed";
    task.diagnostics = diagnostics;
    return kind === "test"
      ? {
          executionId: result.executionId,
          passed: result.state === "completed",
          tests: result.state === "completed" ? 1 : 0,
          failed: result.state === "completed" ? 0 : 1,
          diagnostics,
        }
      : {
          executionId: result.executionId,
          success: result.state === "completed",
          diagnostics,
        };
  }
}
