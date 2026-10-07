# LUMO Phase 10 — Tool Selection / Routing Logic

Phase 10 adds a deterministic routing layer between LUMO Core and the existing Tool Executor. It decides whether a request needs a tool, selects only registered capabilities, extracts typed arguments, validates them against the existing schemas, and prepares a bounded execution plan. The router never executes tools directly and the UI remains unchanged.

## Flow

```text
User request
  → LUMO Core routeRequest boundary
  → DeterministicToolRouter
  → intent and argument extraction
  → registered/enabled tool lookup
  → existing Zod input validation
  → existing permission checker
  → bounded ToolPlan
  → existing Tool Executor (caller-owned execution)
  → normalized ToolResult
```

The backend `routeRequest` procedure exposes the preparation boundary for testing and future orchestration. Existing `runUtility` and `searchWeb` procedures remain execution boundaries and were not replaced.

## Decision types

- `direct_response`: conversational, explanatory, or sufficiently answerable without a tool.
- `tool_call`: a registered, enabled, permission-checked tool with validated arguments and a bounded plan.
- `clarification_required`: intent is recognizable but a required expression, unit, value, date, or search subject is missing or ambiguous.
- `unsupported_request`: the requested capability is not available, disabled, or not permitted.

Decisions contain safe metadata-only diagnostics: request ID, status, selected tool ID, validation state, permission state, and plan length. They do not contain hidden prompts, chain-of-thought, secrets, or raw internal errors.

## Selection behavior

The router recognizes:

- arithmetic and percentage expressions → `calculator`
- explicit source/target unit conversions → `unit_converter`
- average, mean, median, minimum, maximum, sum, and count requests with numeric arrays → `statistics`
- date differences, day arithmetic, timestamps, and durations → `datetime_utility`
- explicit search/browse requests and current/latest/today/news requests → `web_search`
- greetings, explanations, study help, and basic conceptual questions → `direct_response`

It deliberately avoids tools for explanations such as “Why is 2 + 2 equal to 4?” or “Explain what web search means.”

## Context and ambiguity

Only the last bounded set of recent message contents and an optional summary may be supplied to routing. Context can resolve safe anaphora such as “Convert that into miles” when the recent message contains a numeric source value. Missing information produces a clarification rather than a guess.

## Validation and permissions

Extracted arguments are parsed through the selected tool’s existing input schema before a plan is returned. Tool IDs are resolved through the existing registry, enabled state is checked, and every declared permission is checked through the existing permission checker. No alternate unauthorized path is attempted.

## Multi-tool foundation and loop protection

`ToolPlan[]` and per-plan fingerprints provide the future representation boundary for multiple explicit operations. Phase 10 intentionally emits at most one operation per route and does not implement autonomous chaining, recursive execution, or agent loops. Routing depth, repeated fingerprints, and excessive prior fingerprints are blocked before a new plan is prepared.

## Error behavior and security

Unexpected routing, extractor, registry, or permission failures are converted through the Phase 7 fault normalizer into safe unsupported decisions. Unknown capabilities are never invented. Tool implementations remain responsible for execution-time normalized results; the router only prepares validated calls.

## Known limitations

- Routing is deterministic and heuristic; it does not use an LLM selector.
- Complex natural-language expressions, currency conversion, and multi-step dependencies remain unsupported or require clarification.
- Date strings are passed to the existing date/time utility; that utility retains its explicit-timezone rules.
- The router does not automatically execute a plan or modify the existing conversational send flow. Full agent/workflow orchestration is deferred to a later phase.
