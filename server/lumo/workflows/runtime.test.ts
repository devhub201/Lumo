import { describe, expect, it, vi } from "vitest";
import { PermissionManager } from "../security/permissions";
import { MockRuntimeProvider } from "../runtime/mock";
import { RuntimeManager } from "../runtime/manager";
import { planWorkflow } from "./index";
import { WorkflowExecutor } from "./executor";
import {
  InMemorySensitiveGrantStore,
  SensitiveGrantService,
} from "../security/grants";
describe("bounded workflows", () => {
  it("executes sequential dependencies and propagates references", async () => {
    const calls: string[] = [];
    const tools = {
      execute: vi.fn(async (input: any) => {
        calls.push(input.toolId);
        return {
          success: true,
          toolId: input.toolId,
          data: { value: input.arguments.value ?? "result" },
          error: null,
          metadata: { requestId: input.requestId, durationMs: 0 },
        };
      }),
      listTools: () => [],
    };
    const executor = new WorkflowExecutor(tools as any);
    const plan = planWorkflow({
      objective: "two steps",
      steps: [
        {
          id: "first",
          toolId: "one",
          arguments: { value: "x" },
          dependsOn: [],
        },
        {
          id: "second",
          toolId: "two",
          arguments: { value: "$first.data.value" },
          dependsOn: ["first"],
        },
      ],
    });
    const result = await executor.execute(plan, { ownerKey: "peter" });
    expect(result.state).toBe("completed");
    expect(calls).toEqual(["one", "two"]);
    expect(tools.execute.mock.calls[1][0].arguments.value).toBe("x");
  });
  it("rejects recursive or unknown dependencies", () => {
    expect(() =>
      planWorkflow({
        objective: "bad",
        steps: [{ id: "a", toolId: "x", arguments: {}, dependsOn: ["a"] }],
      })
    ).toThrow();
  });
  it("stops at bounded tool-call budget", async () => {
    const tools = {
      execute: vi.fn(async () => ({
        success: true,
        data: {},
        error: null,
        toolId: "x",
        metadata: { requestId: "r", durationMs: 0 },
      })),
      listTools: () => [],
    };
    const plan = planWorkflow({
      objective: "bounded",
      steps: [
        { id: "a", toolId: "x", arguments: {} },
        { id: "b", toolId: "x", arguments: {}, dependsOn: ["a"] },
      ],
      budget: { maxToolCalls: 1 },
    });
    const result = await new WorkflowExecutor(tools as any).execute(plan, {
      ownerKey: "peter",
    });
    expect(result.partialResult).toBe(true);
  });
});
describe("controlled runtime", () => {
  it("requires permission and sensitive authorization", async () => {
    const permissions = new PermissionManager();
    const grants = new SensitiveGrantService(new InMemorySensitiveGrantStore());
    const manager = new RuntimeManager(
      permissions,
      new MockRuntimeProvider(),
      grants
    );
    manager.register({
      id: "mock",
      provider: "mock",
      displayName: "Mock",
      connectionState: "ready",
      capabilities: ["shell"],
      authorized: true,
      metadata: {},
    });
    const denied = await manager.execute({
      targetId: "mock",
      ownerKey: "peter",
      command: {
        kind: "status",
        args: [],
        cwd: "/workspace",
        timeoutMs: 1000,
        maxOutputChars: 1000,
      },
    });
    expect(denied.resourceMetadata.error).toBe("authorization_required");
    permissions.grant("peter", "terminal_runtime", "runtime test");
    const auth = await grants.issue("peter", "runtime_command", "mock");
    const allowed = await manager.execute({
      targetId: "mock",
      ownerKey: "peter",
      command: {
        kind: "status",
        args: [],
        cwd: "/workspace",
        timeoutMs: 1000,
        maxOutputChars: 1000,
      },
      authorization: auth,
    });
    expect(allowed.state).toBe("completed");
  });
  it("rejects traversal and unsupported commands", async () => {
    const permissions = new PermissionManager();
    permissions.grant("peter", "terminal_runtime");
    const manager = new RuntimeManager(permissions, new MockRuntimeProvider());
    manager.register({
      id: "mock",
      provider: "mock",
      displayName: "Mock",
      connectionState: "ready",
      capabilities: ["shell"],
      authorized: true,
      metadata: {},
    });
    const traversal = await manager.execute({
      targetId: "mock",
      ownerKey: "peter",
      command: { kind: "pwd", args: [], cwd: "../secret" },
    });
    expect(traversal.resourceMetadata.error).toBe("command_validation");
  });
});
