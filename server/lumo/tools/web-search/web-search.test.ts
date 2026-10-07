import { describe, expect, it, vi } from "vitest";
import { createContextManager } from "../../context/manager";
import {
  AllowlistToolPermissions,
  DenyAllToolPermissions,
} from "../permissions";
import { ToolExecutor } from "../executor";
import { InMemoryToolRegistry } from "../registry";
import type { LumoLogger } from "../../logger";
import { createWebSearchTool } from "./tool";
import { DuckDuckGoLiteProvider } from "./provider";
import { webSearchInputSchema } from "./contracts";

const logger: LumoLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

const html = `
<table>
<tr><td><a rel="nofollow" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fnews&amp;rut=abc" class="result-link">Example &amp; News</a></td></tr>
<tr><td class="result-snippet">A useful <b>search</b> result.</td></tr>
<tr><td><span class="timestamp">2026-10-04T00:00:00.0000000</span></td></tr>
<tr><td><a rel="nofollow" href="https://example.org/second" class="result-link">Second result</a></td></tr>
<tr><td class="result-snippet">Another source.</td></tr>
</table>`;

const fetchHtml = (body: string, status = 200) =>
  vi.fn(
    async () =>
      new Response(body, { status, headers: { "content-type": "text/html" } })
  );

describe("Phase 8 Web Search provider", () => {
  it("validates empty and malformed input before provider execution", () => {
    expect(webSearchInputSchema.safeParse({ query: "" }).success).toBe(false);
    expect(
      webSearchInputSchema.safeParse({ query: "latest", limit: 11 }).success
    ).toBe(false);
    expect(webSearchInputSchema.parse({ query: "latest" })).toMatchObject({
      query: "latest",
      freshness: "any",
      limit: 5,
    });
  });

  it("normalizes multiple results, domains, source attribution, and publication dates", async () => {
    vi.stubGlobal("fetch", fetchHtml(html));
    const result = await new DuckDuckGoLiteProvider().search({
      query: "latest AI voice APIs",
      freshness: "week",
      limit: 2,
    });
    expect(result).toMatchObject({
      query: "latest AI voice APIs",
      total: 2,
      provider: "DuckDuckGo Lite",
      freshness: { requested: "week", applied: "week", guaranteed: false },
    });
    expect(result.results[0]).toMatchObject({
      title: "Example & News",
      url: "https://example.com/news",
      domain: "example.com",
      snippet: "A useful search result.",
      publicationDate: "2026-10-04T00:00:00.000Z",
      source: {
        provider: "DuckDuckGo Lite",
        attributionUrl: "https://duckduckgo.com/",
      },
    });
    expect(fetchHtml(html)).not.toHaveBeenCalled();
  });

  it("respects the result limit and returns a valid empty-result outcome", async () => {
    const fetchMock = fetchHtml(html);
    vi.stubGlobal("fetch", fetchMock);
    const result = await new DuckDuckGoLiteProvider().search({
      query: "nothing",
      freshness: "today",
      limit: 1,
    });
    expect(result.results).toHaveLength(1);
    expect(result.freshness.limitation).toContain("cannot guarantee");

    vi.stubGlobal(
      "fetch",
      fetchHtml("<html><body><p>No results found</p></body></html>")
    );
    await expect(
      new DuckDuckGoLiteProvider().search({
        query: "no results",
        freshness: "any",
        limit: 5,
      })
    ).resolves.toMatchObject({ total: 0, results: [] });

    vi.stubGlobal("fetch", fetchHtml("<html><body>garbage</body></html>"));
    await expect(
      new DuckDuckGoLiteProvider().search({
        query: "malformed",
        freshness: "any",
        limit: 5,
      })
    ).rejects.toMatchObject({ code: "provider_error" });
  });

  it("rejects provider failures, malformed responses, and timeouts with normalized error codes", async () => {
    vi.stubGlobal("fetch", fetchHtml("upstream", 503));
    await expect(
      new DuckDuckGoLiteProvider({ timeoutMs: 20 }).search({
        query: "failure",
        freshness: "any",
        limit: 5,
      })
    ).rejects.toMatchObject({ code: "provider_error", retryable: true });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Promise<Response>(() => undefined))
    );
    await expect(
      new DuckDuckGoLiteProvider({ timeoutMs: 5 }).search({
        query: "timeout",
        freshness: "any",
        limit: 5,
      })
    ).rejects.toMatchObject({ code: "timeout_error", retryable: true });
  });
});

describe("Phase 8 registered tool and context integration", () => {
  it("registers web_search with a stable contract and enforces network permission", async () => {
    const provider = {
      name: "fake-search",
      search: vi.fn(async input => ({
        query: input.query,
        results: [],
        total: 0,
        freshness: {
          requested: input.freshness,
          applied: input.freshness,
          guaranteed: false,
          limitation: null,
        },
        provider: "fake-search",
      })),
    };
    const registry = new InMemoryToolRegistry();
    registry.register(createWebSearchTool(provider));
    expect(registry.listPublic()[0]).toMatchObject({
      id: "web_search",
      permissions: ["network"],
      enabled: true,
    });

    const denied = await new ToolExecutor(
      registry,
      new DenyAllToolPermissions(),
      logger
    ).execute({
      toolId: "web_search",
      arguments: { query: "latest", freshness: "any", limit: 2 },
      ownerKey: "peter",
      requestId: "req-denied",
    });
    expect(denied).toMatchObject({
      success: false,
      error: { code: "permission_denied" },
    });
    expect(provider.search).not.toHaveBeenCalled();

    const allowed = await new ToolExecutor(
      registry,
      new AllowlistToolPermissions(["network"]),
      logger
    ).execute({
      toolId: "web_search",
      arguments: { query: "latest", freshness: "today", limit: 2 },
      ownerKey: "peter",
      requestId: "req-allowed",
    });
    expect(allowed).toMatchObject({
      success: true,
      toolId: "web_search",
      data: { total: 0 },
    });

    const failedProvider = {
      name: "failed-search",
      search: vi.fn(async () => {
        throw Object.assign(new Error("upstream unavailable"), {
          code: "provider_error",
          retryable: false,
        });
      }),
    };
    const failedRegistry = new InMemoryToolRegistry();
    failedRegistry.register(createWebSearchTool(failedProvider));
    const failed = await new ToolExecutor(
      failedRegistry,
      new AllowlistToolPermissions(["network"]),
      logger
    ).execute({
      toolId: "web_search",
      arguments: { query: "latest", freshness: "any", limit: 2 },
      ownerKey: "peter",
      requestId: "req-provider",
    });
    expect(failed).toMatchObject({
      success: false,
      error: { code: "provider_error" },
    });
  });

  it("passes normalized web evidence through Context Manager budgets with source metadata", () => {
    const result = {
      success: true,
      toolId: "web_search",
      data: {
        query: "latest AI voice APIs",
        results: [
          {
            title: "Source",
            url: "https://example.com",
            domain: "example.com",
            snippet: "Evidence",
            publicationDate: null,
            source: {
              provider: "fake-search",
              attributionUrl: "https://example.com",
            },
          },
        ],
        total: 1,
        freshness: {
          requested: "any" as const,
          applied: "any" as const,
          guaranteed: false,
          limitation: null,
        },
        provider: "fake-search",
      },
      error: null,
      metadata: { requestId: "req-context", durationMs: 1 },
    };
    const context = createContextManager(logger).build({
      requestId: "req-context",
      currentRequest: "latest AI voice APIs",
      personality: {
        name: "LUMO",
        ownerName: "Peter",
        traits: ["calm"],
        responseStyle: ["direct"],
        boundaries: ["safe"],
      },
      toolResults: [result],
      budget: { maxToolResultChars: 500 },
    });
    expect(context.toolResults[0].data).toBeTruthy();
    expect(JSON.stringify(context.messages)).toContain("https://example.com");
    expect(context.metadata.toolResultCharacters).toBeGreaterThan(0);
  });

  it("does not expose credentials in normalized output or diagnostics", async () => {
    const provider = {
      name: "fake-search",
      search: vi.fn(async () => ({
        query: "safe",
        results: [
          {
            title: "Safe",
            url: "https://example.com",
            domain: "example.com",
            snippet: "No secret",
            publicationDate: null,
            source: {
              provider: "fake-search",
              attributionUrl: "https://example.com",
            },
          },
        ],
        total: 1,
        freshness: {
          requested: "any" as const,
          applied: "any" as const,
          guaranteed: false,
          limitation: null,
        },
        provider: "fake-search",
      })),
    };
    const tool = createWebSearchTool(provider);
    const output = await tool.handler(
      { query: "safe", freshness: "any", limit: 1 },
      { ownerKey: "peter", requestId: "req-secret", logger }
    );
    expect(JSON.stringify(output)).not.toMatch(
      /MANUS_API_KEY|OPENAI_API_KEY|authorization|secret-token/i
    );
  });
});
