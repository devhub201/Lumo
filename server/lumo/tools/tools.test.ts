import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ToolExecutor } from "./executor";
import {
  AllowlistToolPermissions,
  DenyAllToolPermissions,
} from "./permissions";
import { InMemoryToolRegistry } from "./registry";
import type { ToolDefinition } from "./contracts";

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

const makeTool = (overrides: Partial<ToolDefinition> = {}): ToolDefinition => ({
  id: "test.echo",
  name: "Echo",
  description: "Returns the supplied value.",
  category: "data",
  inputSchema: z.object({ value: z.string().min(1) }),
  outputSchema: z.object({ value: z.string() }),
  permissions: [],
  enabled: true,
  handler: async input => input,
  ...overrides,
});

const makeExecutor = (
  tool: ToolDefinition,
  permissions = new AllowlistToolPermissions()
) => {
  const registry = new InMemoryToolRegistry();
  registry.register(tool);
  return {
    registry,
    executor: new ToolExecutor(registry, permissions, logger),
  };
};

describe("LUMO tool registry and executor", () => {
  it("registers, retrieves, and lists explicit tool metadata", () => {
    const registry = new InMemoryToolRegistry();
    registry.register(makeTool());
    expect(registry.get("test.echo")?.name).toBe("Echo");
    expect(registry.listPublic()).toEqual([
      expect.objectContaining({ id: "test.echo", enabled: true }),
    ]);
  });

  it("rejects duplicate registrations and supports disabling a tool", () => {
    const registry = new InMemoryToolRegistry();
    registry.register(makeTool());
    expect(() => registry.register(makeTool())).toThrow("already registered");
    registry.setEnabled("test.echo", false);
    expect(registry.get("test.echo")?.enabled).toBe(false);
  });

  it("returns a normalized result for an unknown tool", async () => {
    const registry = new InMemoryToolRegistry();
    const result = await new ToolExecutor(
      registry,
      new AllowlistToolPermissions(),
      logger
    ).execute({
      toolId: "missing.tool",
      arguments: {},
      ownerKey: "peter",
      requestId: "req-1",
    });
    expect(result).toMatchObject({
      success: false,
      toolId: "missing.tool",
      error: { code: "unknown_tool" },
      metadata: { requestId: "req-1" },
    });
  });

  it("rejects disabled tools before execution", async () => {
    const handler = vi.fn(async () => ({ value: "no" }));
    const { registry, executor } = makeExecutor(
      makeTool({ handler, enabled: false })
    );
    const result = await executor.execute({
      toolId: "test.echo",
      arguments: { value: "x" },
      ownerKey: "peter",
    });
    expect(result.error?.code).toBe("tool_disabled");
    expect(handler).not.toHaveBeenCalled();
    expect(registry.listPublic()[0].enabled).toBe(false);
  });

  it("rejects invalid arguments without invoking the handler", async () => {
    const handler = vi.fn(async () => ({ value: "no" }));
    const { executor } = makeExecutor(makeTool({ handler }));
    const result = await executor.execute({
      toolId: "test.echo",
      arguments: { value: 42 },
      ownerKey: "peter",
    });
    expect(result.error?.code).toBe("invalid_arguments");
    expect(handler).not.toHaveBeenCalled();
  });

  it("checks required permissions before execution", async () => {
    const handler = vi.fn(async () => ({ value: "no" }));
    const { executor } = makeExecutor(
      makeTool({ handler, permissions: ["network"] }),
      new DenyAllToolPermissions()
    );
    const result = await executor.execute({
      toolId: "test.echo",
      arguments: { value: "x" },
      ownerKey: "peter",
    });
    expect(result.error?.code).toBe("permission_denied");
    expect(handler).not.toHaveBeenCalled();
  });

  it("executes an allowed tool and normalizes its output", async () => {
    const { executor } = makeExecutor(
      makeTool({ permissions: ["files"] }),
      new AllowlistToolPermissions(["files"])
    );
    const result = await executor.execute<{ value: string }>({
      toolId: "test.echo",
      arguments: { value: "hello" },
      ownerKey: "peter",
      requestId: "req-2",
    });
    expect(result).toMatchObject({
      success: true,
      toolId: "test.echo",
      data: { value: "hello" },
      error: null,
      metadata: { requestId: "req-2" },
    });
    expect(result.metadata.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("normalizes handler failures and never exposes the raw error", async () => {
    const { executor } = makeExecutor(
      makeTool({
        handler: async () => {
          throw new Error("DATABASE_URL=secret");
        },
      })
    );
    const result = await executor.execute({
      toolId: "test.echo",
      arguments: { value: "x" },
      ownerKey: "peter",
    });
    expect(result).toMatchObject({
      success: false,
      error: {
        code: "execution_failed",
        message: "The tool could not complete safely.",
      },
    });
    expect(JSON.stringify(result)).not.toContain("DATABASE_URL");
  });

  it("rejects invalid handler output", async () => {
    const { executor } = makeExecutor(
      makeTool({ handler: async () => ({ wrong: true }) })
    );
    const result = await executor.execute({
      toolId: "test.echo",
      arguments: { value: "x" },
      ownerKey: "peter",
    });
    expect(result.error?.code).toBe("invalid_output");
  });
});
