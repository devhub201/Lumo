import { describe, expect, it } from "vitest";
import {
  AllowlistToolPermissions,
  DenyAllToolPermissions,
} from "../tools/permissions";
import { InMemoryToolRegistry } from "../tools/registry";
import { utilityTools } from "../tools/utility";
import { createWebSearchTool } from "../tools/web-search";
import { DeterministicToolRouter } from "./router";
import { extractCandidates } from "./extractors";

const fakeSearch = {
  name: "fake-search",
  search: async (input: {
    query: string;
    freshness: "any" | "today" | "week" | "month";
    limit: number;
  }) => ({
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
  }),
};

const makeRouter = (
  permissions = new AllowlistToolPermissions(["network"])
) => {
  const registry = new InMemoryToolRegistry();
  for (const tool of utilityTools) registry.register(tool);
  registry.register(createWebSearchTool(fakeSearch));
  return {
    router: new DeterministicToolRouter({ registry, permissions }),
    registry,
  };
};

const route = async (
  router: DeterministicToolRouter,
  text: string,
  extra: Record<string, unknown> = {}
) => router.route({ text, ownerKey: "peter", requestId: "req-test", ...extra });

describe("Phase 10 direct response and utility routing", () => {
  it("recognizes controlled coding and browser workspace requests", () => {
    expect(
      extractCandidates("Create a coding project and patch the code")
    ).toContainEqual(expect.objectContaining({ toolId: "coding_workspace" }));
    expect(
      extractCandidates("Open the website https://example.com")
    ).toContainEqual(
      expect.objectContaining({
        toolId: "browser_workspace",
        arguments: { operation: "open", url: "https://example.com" },
      })
    );
  });
  it("keeps greetings, explanations, and sufficient direct answers out of tools", async () => {
    const { router } = makeRouter();
    expect((await route(router, "Hello LUMO.")).type).toBe("direct_response");
    expect((await route(router, "Explain photosynthesis.")).type).toBe(
      "direct_response"
    );
    expect((await route(router, "Why is 2 + 2 equal to 4?")).type).toBe(
      "direct_response"
    );
    expect((await route(router, "Tell me what a calculator is.")).type).toBe(
      "direct_response"
    );
  });

  it("selects calculator and extracts safe expressions", async () => {
    const { router } = makeRouter();
    expect(await route(router, "847 × 29")).toMatchObject({
      type: "tool_call",
      toolId: "calculator",
      arguments: { expression: "847 * 29" },
      confidence: "high",
    });
    expect(await route(router, "What's 18% of 750?")).toMatchObject({
      type: "tool_call",
      toolId: "calculator",
      arguments: { expression: "18% of 750" },
    });
    expect(await route(router, "Calculate (12 + 8) × 5")).toMatchObject({
      type: "tool_call",
      toolId: "calculator",
      arguments: { expression: "(12 + 8) * 5" },
    });
  });

  it("selects unit conversion and extracts source and target units", async () => {
    const { router } = makeRouter();
    expect(await route(router, "Convert 5 kilometers to miles.")).toMatchObject(
      {
        type: "tool_call",
        toolId: "unit_converter",
        arguments: { value: 5, from: "kilometers", to: "miles" },
      }
    );
    expect(await route(router, "72 Fahrenheit in Celsius")).toMatchObject({
      type: "tool_call",
      toolId: "unit_converter",
      arguments: { value: 72, from: "Fahrenheit", to: "Celsius" },
    });
    expect(await route(router, "2 GB in MB")).toMatchObject({
      type: "tool_call",
      toolId: "unit_converter",
      arguments: { value: 2, from: "GB", to: "MB" },
    });
  });

  it("selects statistics and date/time utilities", async () => {
    const { router } = makeRouter();
    expect(await route(router, "Average of 12, 18, 21 and 25")).toMatchObject({
      type: "tool_call",
      toolId: "statistics",
      arguments: { operation: "mean", values: [12, 18, 21, 25] },
    });
    expect(
      await route(router, "What's the median of these numbers?")
    ).toMatchObject({ type: "clarification_required" });
    expect(
      await route(
        router,
        "How many days between 2026-01-01T00:00:00Z and 2026-01-05T00:00:00Z?"
      )
    ).toMatchObject({
      type: "tool_call",
      toolId: "datetime_utility",
      arguments: { operation: "difference" },
    });
    expect(
      await route(router, "Add 30 days to 2026-01-01T00:00:00Z.")
    ).toMatchObject({
      type: "tool_call",
      toolId: "datetime_utility",
      arguments: { operation: "add_days", days: 30 },
    });
  });
});

describe("Phase 10 web, ambiguity, context, and safety routing", () => {
  it("selects web search for current or explicit external information but not explanations of search", async () => {
    const { router } = makeRouter();
    expect(
      await route(
        router,
        "Search the internet for the latest Minecraft update."
      )
    ).toMatchObject({
      type: "tool_call",
      toolId: "web_search",
      arguments: { query: "the latest Minecraft update", freshness: "week" },
    });
    expect(await route(router, "What happened today?")).toMatchObject({
      type: "tool_call",
      toolId: "web_search",
      arguments: { freshness: "today" },
    });
    expect(await route(router, "Explain what web search means.")).toMatchObject(
      { type: "direct_response" }
    );
  });

  it("asks for missing information instead of guessing", async () => {
    const { router } = makeRouter();
    expect(await route(router, "Convert 50.")).toMatchObject({
      type: "clarification_required",
    });
    expect(await route(router, "Search this.")).toMatchObject({
      type: "clarification_required",
    });
    expect(await route(router, "Calculate this.")).toMatchObject({
      type: "clarification_required",
    });
    expect(await route(router, "What's the average?")).toMatchObject({
      type: "clarification_required",
    });
  });

  it("uses selected recent context for anaphoric search requests", async () => {
    const { router } = makeRouter();
    expect(
      await route(
        router,
        "Search the latest information about the thing we were discussing.",
        {
          context: {
            recentMessages: [
              {
                role: "user",
                content: "We were discussing the Minecraft 1.22 update.",
              },
            ],
          },
        }
      )
    ).toMatchObject({ type: "tool_call", toolId: "web_search" });
  });

  it("blocks unsupported capabilities, disabled tools, permission denial, and repeated plans", async () => {
    const { router, registry } = makeRouter();
    expect(await route(router, "Send an email to Peter.")).toMatchObject({
      type: "unsupported_request",
    });

    registry.setEnabled("calculator", false);
    expect(await route(router, "2 + 2")).toMatchObject({
      type: "unsupported_request",
      diagnostics: { status: "tool_unavailable" },
    });

    const denied = makeRouter(new DenyAllToolPermissions()).router;
    expect(
      await route(denied, "Search the latest Minecraft update.")
    ).toMatchObject({
      type: "unsupported_request",
      diagnostics: { status: "permission_denied" },
    });

    const { router: loopRouter } = makeRouter();
    const first = await route(loopRouter, "2 + 2");
    expect(
      await route(loopRouter, "2 + 2", {
        previousFingerprints: [
          (first as { plan: [{ fingerprint: string }] }).plan[0].fingerprint,
        ],
      })
    ).toMatchObject({
      type: "clarification_required",
      diagnostics: { status: "loop_blocked" },
    });
    expect(await route(loopRouter, "2 + 2", { routingDepth: 1 })).toMatchObject(
      {
        type: "clarification_required",
        diagnostics: { status: "loop_blocked" },
      }
    );
  });
});

describe("Phase 10 routing contracts", () => {
  it("returns bounded, validated plans and metadata-only diagnostics", async () => {
    const { router } = makeRouter();
    const decision = await route(router, "Calculate 847 times 29");
    expect(decision).toMatchObject({
      type: "tool_call",
      plan: [
        {
          toolId: "calculator",
          depth: 0,
          requestId: expect.any(String),
          fingerprint: expect.stringContaining("calculator:"),
        },
      ],
      diagnostics: {
        validation: "passed",
        permission: "passed",
        planLength: 1,
      },
    });
    expect(JSON.stringify(decision)).not.toMatch(
      /chain.of.thought|system prompt|api.key|secret/i
    );
  });
});
