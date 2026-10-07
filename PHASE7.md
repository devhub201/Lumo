# LUMO Phase 7 — Error Handling + Fallbacks

Phase 7 adds a centralized, server-side fault layer without redesigning the UI, replacing existing subsystems, or implementing individual tools.

## Error architecture

`server/lumo/faults/contracts.ts` defines typed `LumoFault` records with code, category, severity, retryability, retry-safety, safe user message, private internal message, metadata, and request ID. `normalize.ts` is the single normalization path for LUMO/domain errors, JavaScript errors, unknown thrown values, provider/API records, HTTP status records, Zod validation errors, timeout signals, and database errors. `messages.ts` provides safe user-facing conversion. Raw causes are never returned to clients.

Categories include validation, authentication, authorization, network, timeout, rate limit, provider, model, memory, context, tool, database, persistence, configuration, internal, and unknown. Severity is independent from retryability.

## Retry strategy

`retry.ts` retries only normalized retryable faults and respects `safe_to_retry`, `conditionally_retryable`, and `not_retryable` boundaries. It supports maximum attempts, exponential backoff, maximum delay, jitter, request IDs, recovery reporting, and exhaustion diagnostics. LUMO Core uses a bounded two-attempt retry for model/provider calls with zero initial delay in the testing build. Invalid input, authentication, authorization, configuration, and deterministic validation failures do not retry.

Future write or destructive tools should use `conditionally_retryable` or `not_retryable`; read-only operations can opt into safe retries.

## Fallback strategy

`fallback.ts` provides a reusable primary/fallback runner that returns `usedFallback` and the normalized fault, preventing false success claims. Core uses it for memory retrieval and recall: a memory failure continues without memory and records a diagnostic. Context Manager retains its domain-specific minimal-request fallback while normalizing context failures through the Phase 7 fault layer. Summary persistence remains non-critical: a response can continue, but the failure is logged and no success claim says the summary was saved. Conversation-turn persistence remains critical; if it fails, Core does not return a successful persisted turn.

## Integrations

- **Core:** correlation IDs are propagated into Context Manager, provider retry, fallback, and turn diagnostics.
- **Provider:** normalized provider/timeout failures are retried through the shared policy and safely returned when exhausted.
- **Context Manager:** context failures are classified as context faults while preserving the existing minimal fallback behavior.
- **Tool Executor:** handler exceptions are normalized as tool faults and remain `ToolResult.success = false`; no individual tools are registered.
- **Persistence and memory:** non-critical memory/summary failures degrade safely; critical conversation persistence does not claim success when it fails.

## Diagnostics and security

Diagnostics events include `error.detected`, `error.normalized`, `error.retry.started`, `error.retry.completed`, `error.retry.exhausted`, `error.fallback.used`, `error.recovered`, and `error.unrecovered`. They contain request IDs, codes, categories, severity, retryability, attempt counts, and durations where relevant—not secrets, credentials, prompts, raw conversation content, raw payloads, stack traces, or server paths.

## Phase 8 Web Search integration

Phase 8 can register a `web.search` definition in the existing `InMemoryToolRegistry` with a Zod input schema, structured output schema, `network` permission, and an explicitly selected retry-safety policy. Its handler should call a provider adapter that throws typed or normalizable network/rate-limit/provider errors. `ToolExecutor` will validate arguments and output, enforce permission, normalize failures into `ToolResult.success = false`, and pass the result through Context Manager as normalized tool context. Phase 8 should not bypass the registry, execute arbitrary URLs/commands, expose provider keys, or implement its own retry/error envelope.
