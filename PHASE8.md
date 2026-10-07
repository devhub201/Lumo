# LUMO Phase 8 — Web Search Tool

Phase 8 adds a real, modular web-search capability without changing the UI, conversation persistence, memory behavior, or existing Phase 5–7 boundaries.

## Architecture

```text
LUMO backend boundary
  → registered web_search Tool Definition
  → Tool Executor (schema validation + network permission + normalized errors)
  → SearchProvider adapter
  → normalized source-attributed WebSearchOutput
  → Context Manager (bounded tool-result context)
  → future LUMO reasoning
```

`server/lumo/tools/web-search/contracts.ts` owns provider-independent input/output schemas. Input accepts a trimmed query, optional freshness (`any`, `today`, `week`, or `month`), and a bounded result limit. Each result contains a validated HTTP(S) URL, title, domain, snippet, optional publication date, and provider attribution.

`SearchProvider` is replaceable. The first implementation is `DuckDuckGoLiteProvider`, which uses the public DuckDuckGo Lite HTML search endpoint because this project has no registered managed API-hub search provider. The provider is isolated from LUMO Core and can be replaced without changing the tool contract, Tool System, Context Manager, or router boundary.

## Safety and error behavior

- Query, freshness, and limit are validated with Zod.
- URLs are parsed and restricted to HTTP(S); DuckDuckGo redirect links are unwrapped safely.
- Malformed provider entries are skipped rather than passed to the model.
- Empty results are a valid successful outcome when the provider returns a valid results page with no entries.
- Provider failures, network failures, rate limits, malformed responses, and timeouts use Phase 7 normalized faults and bounded retries.
- The tool never exposes credentials, raw provider payloads, stack traces, or arbitrary request formats.
- `network` permission is explicitly allowlisted; the registry and executor are never bypassed.
- Freshness is translated to the provider's recency filter where available, but `guaranteed: false` and a limitation message are returned because LUMO cannot prove publication recency for every result.
- Search evidence is not persisted as memory.

## Context integration

`buildWebSearchContext` passes the complete normalized `ToolResult` through the existing Context Manager. Existing context budgets cap serialized tool evidence, and source metadata remains inside the normalized result so future reasoning can distinguish web evidence from memory and conversation context.

The backend-only `searchWeb` procedure invokes the registered `web_search` tool and returns the normalized result plus Context Manager diagnostics. No new UI screen or citation presentation was added.

## Current provider limitation

The managed API hub was probed during implementation and did not expose a registered search API for this project. DuckDuckGo Lite is therefore the initial public provider. A future managed or paid provider can implement `SearchProvider` and be injected into `createWebSearchTool` without modifying LUMO Core.

## Explicit non-goals

This phase does not add automatic search routing for every message, voice, Spotify, camera/vision, terminal/computer control, visual citations, or Phase 10 routing. Deterministic Phase 9 utility tools are separate registered capabilities; intelligent selection/routing remains a later boundary.
