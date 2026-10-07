# LUMO Phase 6 — Context Management

Phase 6 adds a dedicated Context Management layer between existing conversation/memory retrieval and the LUMO provider. The UI and individual tool set remain unchanged.

## Flow

`User message → conversation persistence → existing memory retrieval → Context Manager → LUMO Core → model/API → response`

The Context Manager receives already retrieved memories from the existing storage-backed memory layer. It does not create a second memory database, delete persisted messages, or replace summaries.

## Modules

- `context/contracts.ts` — typed normalized context, source names, configurable priorities, budgets, diagnostics, and tool-result inputs.
- `context/selection.ts` — deterministic token-overlap relevance, category-aware scoring, stable profile/preference inclusion, and bounded recent-message selection.
- `context/budget.ts` — character/token estimation, memory/summary/tool-result formatting, and priority-aware truncation.
- `context/diagnostics.ts` — metadata-only lifecycle events.
- `context/manager.ts` — orchestration, validation, safe fallback, and model-ready `Message[]` conversion.
- `context/index.ts` — stable module exports.

## Priority and budget strategy

Defaults prioritize the current request, system rules, recent conversation, normalized tool results, relevant memories, and then summaries. Priorities are configurable rather than hard-coded into selection behavior. Budgets include maximum recent messages, memory items, summary length, tool-result characters, system characters, estimated context tokens, and estimation characters-per-token.

When a context exceeds budget, the manager removes lower-priority historical material first: old recent messages, lower-ranked memories, summary, tool results, and only then extra system entries while preserving at least one system entry. The current request is always retained. Diagnostics report truncation and omitted source categories.

## Memory and conversation integration

The existing Core still retrieves memories and persists original messages and rolling summaries. The Context Manager filters already retrieved memories deterministically, keeps relevant recent messages, includes a bounded summary, and leaves the original conversation recoverable in the database. Retrieval, summary, and context failures fall back to available context instead of crashing the conversation.

## Tool compatibility

Phase 5 normalized tool results can be supplied as context. The Context Manager validates the normalized result envelope before including it and bounds serialized result data. No tool routing or individual tool implementation is included.

## Privacy and diagnostics

Context lifecycle logs contain counts, sizes, request-independent source metadata, truncation status, and error codes. They do not log raw messages, memory contents, tool arguments, outputs, prompts, credentials, environment variables, or API keys.

## Future Phase 7 integration

A future Error Handling/Fallback layer can wrap `ContextManager.build` and the Core/provider boundary. It can classify context failures, provider timeouts, tool failures, and persistence failures, then select retry, degraded-context, or user-safe response policies. Phase 6 already returns a minimal current-request context on manager failure and emits a stable `context.build.failed` event, giving Phase 7 a clean interception point without moving error policy into the Context Manager.
