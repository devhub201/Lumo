import { describe, expect, it, vi } from "vitest";
import { createContextManager } from "../../context/manager";
import {
  AllowlistToolPermissions,
  DenyAllToolPermissions,
} from "../permissions";
import { ToolExecutor } from "../executor";
import { InMemoryToolRegistry } from "../registry";
import type { LumoLogger } from "../../logger";
import { calculate } from "./calculator";
import { convertUnits } from "./converter";
import { calculateDatetime } from "./datetime";
import { calculateStatistics } from "./statistics";
import { utilityTools } from "./tools";
import { buildUtilityContext } from "./context";

const logger: LumoLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

const execute = async (toolId: string, args: unknown) => {
  const registry = new InMemoryToolRegistry();
  for (const tool of utilityTools) registry.register(tool);
  return new ToolExecutor(
    registry,
    new AllowlistToolPermissions(),
    logger
  ).execute({
    toolId,
    arguments: args,
    ownerKey: "peter",
    requestId: `req-${toolId}`,
  });
};

describe("Phase 9 calculator", () => {
  it("evaluates arithmetic, parentheses, powers, decimals, sqrt, and percentage expressions", () => {
    expect(calculate({ expression: "2 + 2" }).value).toBe(4);
    expect(calculate({ expression: "847 * 29" }).value).toBe(24563);
    expect(calculate({ expression: "(15 + 7) / 2" }).value).toBe(11);
    expect(calculate({ expression: "2^10" }).value).toBe(1024);
    expect(calculate({ expression: "sqrt(144)" }).value).toBe(12);
    expect(calculate({ expression: "18% of 750" }).value).toBe(135);
    expect(calculate({ expression: "0.5 + .25" }).value).toBe(0.75);
  });

  it("rejects division by zero, invalid syntax, unsupported functions, and malicious input", () => {
    expect(() => calculate({ expression: "1 / 0" })).toThrow();
    expect(() => calculate({ expression: "2 +" })).toThrow();
    expect(() => calculate({ expression: "Math.sqrt(4)" })).toThrow();
    expect(() => calculate({ expression: "process.env.SECRET" })).toThrow();
    expect(() =>
      calculate({ expression: "1; throw new Error('x')" })
    ).toThrow();
    expect(() => calculate({ expression: "sqrt(-1)" })).toThrow();
  });
});

describe("Phase 9 unit conversion", () => {
  it("converts length, mass, temperature, time, and data using explicit categories", () => {
    expect(convertUnits({ value: 5, from: "km", to: "mile" })).toMatchObject({
      convertedValue: 3.1068559611866697,
      category: "length",
      from: "km",
      to: "mile",
    });
    expect(
      convertUnits({ value: 1, from: "kg", to: "lb" }).convertedValue
    ).toBeCloseTo(2.20462, 4);
    expect(
      convertUnits({ value: 72, from: "fahrenheit", to: "celsius" })
        .convertedValue
    ).toBeCloseTo(22.2222, 3);
    expect(
      convertUnits({ value: 3, from: "hours", to: "seconds" }).convertedValue
    ).toBe(10800);
    expect(
      convertUnits({ value: 1, from: "GB", to: "MB" }).convertedValue
    ).toBe(1024);
  });

  it("rejects unsupported units and cross-category or ambiguous conversions", () => {
    expect(() =>
      convertUnits({ value: 1, from: "lightyear", to: "km" })
    ).toThrow();
    expect(() => convertUnits({ value: 1, from: "kg", to: "m" })).toThrow();
    expect(() => convertUnits({ value: 1, from: "", to: "m" })).toThrow();
  });
});

describe("Phase 9 statistics", () => {
  it("calculates sum, mean, median, min, max, and count without mutating input", () => {
    const values = [12, 18, 21, 25];
    expect(calculateStatistics({ operation: "sum", values }).result).toBe(76);
    expect(calculateStatistics({ operation: "mean", values }).result).toBe(19);
    expect(calculateStatistics({ operation: "average", values }).result).toBe(
      19
    );
    expect(calculateStatistics({ operation: "median", values }).result).toBe(
      19.5
    );
    expect(calculateStatistics({ operation: "min", values }).result).toBe(12);
    expect(calculateStatistics({ operation: "max", values }).result).toBe(25);
    expect(calculateStatistics({ operation: "count", values }).result).toBe(4);
    expect(values).toEqual([12, 18, 21, 25]);
  });

  it("validates bounded finite numeric input", () => {
    expect(() =>
      calculateStatistics({ operation: "sum", values: [] })
    ).toThrow();
    expect(() =>
      calculateStatistics({ operation: "sum", values: [Number.NaN] })
    ).toThrow();
    expect(() =>
      calculateStatistics({
        operation: "sum",
        values: Array.from({ length: 10001 }, () => 1),
      })
    ).toThrow();
  });
});

describe("Phase 9 date/time utility", () => {
  it("calculates timezone-aware differences and adds days", () => {
    expect(
      calculateDatetime({
        operation: "difference",
        start: "2026-01-01T00:00:00+05:30",
        end: "2026-01-02T00:00:00+05:30",
        timezone: "Asia/Kolkata",
      }).result
    ).toMatchObject({ days: 1, hours: 24 });
    expect(
      calculateDatetime({
        operation: "add_days",
        date: "2026-01-01T00:00:00Z",
        days: 3,
        timezone: "UTC",
      }).result.iso
    ).toBe("2026-01-04T00:00:00.000Z");
  });

  it("converts timestamps, calculates durations, and rejects implicit or invalid timezones", () => {
    expect(
      calculateDatetime({ operation: "timestamp", timestamp: 0 }).result.iso
    ).toBe("1970-01-01T00:00:00.000Z");
    expect(
      calculateDatetime({ operation: "duration", seconds: 7200 }).result.hours
    ).toBe(2);
    expect(() =>
      calculateDatetime({
        operation: "difference",
        start: "2026-01-01",
        end: "2026-01-02",
      })
    ).toThrow();
    expect(() =>
      calculateDatetime({
        operation: "difference",
        start: "not-a-date",
        end: "2026-01-02T00:00:00Z",
      })
    ).toThrow();
  });
});

describe("Phase 9 Tool System and Context Manager integration", () => {
  it("registers all utilities with precise descriptions and no permissions", () => {
    const registry = new InMemoryToolRegistry();
    for (const tool of utilityTools) registry.register(tool);
    expect(registry.listPublic()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "calculator",
          permissions: [],
          enabled: true,
        }),
        expect.objectContaining({
          id: "unit_converter",
          permissions: [],
          enabled: true,
        }),
        expect.objectContaining({
          id: "statistics",
          permissions: [],
          enabled: true,
        }),
        expect.objectContaining({
          id: "datetime_utility",
          permissions: [],
          enabled: true,
        }),
      ])
    );
  });

  it("executes utility tools without network permission and returns normalized results", async () => {
    const result = await execute("calculator", { expression: "847 * 29" });
    expect(result).toMatchObject({
      success: true,
      toolId: "calculator",
      data: { value: 24563 },
    });

    const invalid = await execute("calculator", { expression: "1 / 0" });
    expect(invalid).toMatchObject({
      success: false,
      error: { code: "validation_error", retryable: false },
    });

    const noPermissionRegistry = new InMemoryToolRegistry();
    for (const tool of utilityTools) noPermissionRegistry.register(tool);
    const deniedNetwork = await new ToolExecutor(
      noPermissionRegistry,
      new DenyAllToolPermissions(),
      logger
    ).execute({
      toolId: "calculator",
      arguments: { expression: "2 + 2" },
      ownerKey: "peter",
      requestId: "req-no-network",
    });
    expect(deniedNetwork).toMatchObject({ success: true, data: { value: 4 } });
  });

  it("passes structured utility results through Context Manager budgets", async () => {
    const utilityResult = await execute("statistics", {
      operation: "median",
      values: [1, 5, 9],
    });
    const context = buildUtilityContext(logger, {
      requestId: "req-context",
      currentRequest: "statistics utility request",
      personality: {
        name: "LUMO",
        ownerName: "Peter",
        traits: ["calm"],
        responseStyle: ["direct"],
        boundaries: ["safe"],
      },
      utilityResult,
    });
    expect(context.toolResults[0].data).toBe(
      '{"operation":"median","count":3,"result":5}'
    );
    expect(context.messages[0].content).toContain('\\"result\\":5');
    expect(context.metadata.toolResultCharacters).toBeGreaterThan(0);
  });
});
