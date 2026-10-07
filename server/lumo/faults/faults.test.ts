import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { withFallback } from "./fallback";
import { safeErrorMessage } from "./messages";
import { normalizeFault, toSafePublicFault } from "./normalize";
import { withRetry } from "./retry";

const makeLogger = () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
});

describe("Phase 7 fault normalization", () => {
  it("normalizes Error, unknown values, provider, HTTP, validation, timeout, and database failures", () => {
    expect(normalizeFault(new Error("network down")).category).toBe("network");
    expect(normalizeFault("unknown thrown value").code).toBe("unexpected");
    expect(
      normalizeFault({ code: "provider_failed", retryable: true }).category
    ).toBe("provider");
    expect(
      normalizeFault({ status: 429, message: "too many requests" }).category
    ).toBe("rate_limit");
    expect(
      normalizeFault(
        z.object({ value: z.string() }).safeParse({ value: 1 }).error
      ).category
    ).toBe("validation");
    expect(normalizeFault(new Error("request timed out")).category).toBe(
      "timeout"
    );
    expect(normalizeFault({ code: "database_unavailable" }).category).toBe(
      "database"
    );
  });

  it("assigns severity and retry safety without conflating the two", () => {
    const invalid = normalizeFault({ code: "invalid_input", retryable: false });
    const timeout = normalizeFault({
      code: "provider_timeout",
      retryable: true,
    });
    expect(invalid).toMatchObject({
      category: "validation",
      severity: "warning",
      retrySafety: "not_retryable",
      retryable: false,
    });
    expect(timeout).toMatchObject({
      category: "timeout",
      severity: "warning",
      retrySafety: "safe_to_retry",
      retryable: true,
    });
  });

  it("keeps secrets, stack traces, and internal paths out of safe messages and public faults", () => {
    const error = new Error(
      "DATABASE_URL=mysql://private/API_KEY=secret at /srv/app/server.ts:1"
    );
    const publicFault = toSafePublicFault(error, "req-safe");
    expect(publicFault.message).not.toContain("DATABASE_URL");
    expect(publicFault.message).not.toContain("mysql://private");
    expect(publicFault.message).not.toContain("/srv/app");
    expect(safeErrorMessage(error)).not.toContain("API_KEY");
    expect(JSON.stringify(publicFault)).not.toContain("secret");
  });
});

describe("Phase 7 retry and fallback", () => {
  it("retries retryable operations, respects max attempts, and reports recovery", async () => {
    const logger = makeLogger();
    let calls = 0;
    const result = await withRetry({
      operation: async () => {
        calls += 1;
        if (calls === 1) throw { code: "provider_timeout", retryable: true };
        return "ok";
      },
      logger,
      requestId: "req-retry",
      policy: { maxAttempts: 3, initialDelayMs: 0, jitter: 0 },
    });
    expect(result).toMatchObject({ value: "ok", attempts: 2, recovered: true });
    expect(logger.info).toHaveBeenCalledWith(
      "error.retry.started",
      expect.objectContaining({ attempt: 1, requestId: "req-retry" })
    );
    expect(logger.info).toHaveBeenCalledWith("error.recovered", {
      requestId: "req-retry",
    });
  });

  it("does not retry non-retryable failures and respects retry safety", async () => {
    const logger = makeLogger();
    const operation = vi.fn(async () => {
      throw { code: "invalid_input", retryable: false };
    });
    const result = await withRetry({
      operation,
      logger,
      policy: { maxAttempts: 4, initialDelayMs: 0 },
      requestId: "req-no-retry",
    });
    expect(operation).toHaveBeenCalledTimes(1);
    expect(result.fault).toMatchObject({
      category: "validation",
      retryable: false,
      retrySafety: "not_retryable",
    });
  });

  it("respects maximum attempts and records exhaustion with bounded backoff", async () => {
    const logger = makeLogger();
    const result = await withRetry({
      operation: async () => {
        throw { code: "provider_failed", retryable: true };
      },
      logger,
      requestId: "req-exhaust",
      policy: {
        maxAttempts: 2,
        initialDelayMs: 1,
        backoffMultiplier: 2,
        jitter: 0,
      },
    });
    expect(result).toMatchObject({
      attempts: 2,
      recovered: false,
      fault: { category: "provider" },
    });
    expect(logger.error).toHaveBeenCalledWith(
      "error.retry.exhausted",
      expect.objectContaining({ attempts: 2 })
    );
  });

  it("uses a degraded fallback without claiming the primary operation succeeded", async () => {
    const logger = makeLogger();
    const result = await withFallback({
      primary: async () => {
        throw { code: "memory_unavailable", retryable: false };
      },
      fallback: async fault => `fallback:${fault.category}`,
      logger,
      requestId: "req-fallback",
    });
    expect(result).toEqual({
      value: "fallback:memory",
      usedFallback: true,
      fault: expect.objectContaining({ category: "memory" }),
    });
    expect(logger.warn).toHaveBeenCalledWith(
      "error.fallback.used",
      expect.objectContaining({ requestId: "req-fallback" })
    );
  });
});
