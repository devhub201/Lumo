import { withRetry } from "../../faults/retry";
import type { ToolDefinition } from "../contracts";
import {
  webSearchInputSchema,
  webSearchOutputSchema,
  type SearchProvider,
  type WebSearchInput,
  type WebSearchOutput,
} from "./contracts";
import { DuckDuckGoLiteProvider } from "./provider";

export const WEB_SEARCH_TOOL_ID = "web_search" as const;

export const createWebSearchTool = (
  provider: SearchProvider = new DuckDuckGoLiteProvider()
): ToolDefinition<WebSearchInput, WebSearchOutput> => ({
  id: WEB_SEARCH_TOOL_ID,
  name: "Web Search",
  description:
    "Search the public web for current information and return bounded, source-attributed evidence.",
  category: "external",
  inputSchema: webSearchInputSchema,
  outputSchema: webSearchOutputSchema,
  permissions: ["network"],
  enabled: true,
  handler: async (input, context) => {
    const result = await withRetry({
      operation: () => provider.search(input),
      logger: context.logger,
      requestId: context.requestId,
      policy: {
        maxAttempts: 2,
        initialDelayMs: 150,
        backoffMultiplier: 2,
        maxDelayMs: 1000,
        jitter: 0,
        retrySafety: "safe_to_retry",
      },
    });
    if (!result.value) throw result.fault ?? new Error("web search failed");
    context.logger.info("web_search_completed", {
      requestId: context.requestId,
      provider: result.value.provider,
      resultCount: result.value.results.length,
      freshness: result.value.freshness.applied,
      recovered: result.recovered,
    });
    return result.value;
  },
});
