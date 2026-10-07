# LUMO Phase 9 — Calculator + Utility Tools

Phase 9 adds deterministic utility capabilities through the existing Phase 5 Tool System. The UI is unchanged; Phase 10 now supplies the separate preparation-only routing layer.

## Registered tools

- `calculator`: bounded recursive-descent arithmetic parser supporting addition, subtraction, multiplication, division, parentheses, powers, `sqrt`, decimals, and safe percentage expressions such as `18% of 750`.
- `unit_converter`: explicit conversions across length, mass, temperature, time, and data categories. Incompatible categories and unsupported/ambiguous units are rejected.
- `statistics`: deterministic sum, mean/average, minimum, maximum, median, and count over finite arrays bounded to 10,000 values.
- `datetime_utility`: timezone-explicit date differences and day arithmetic, UTC timestamp conversion, and duration calculations. Date strings without an explicit timezone offset are rejected rather than silently interpreted.

## Architecture

```text
backend utility boundary
  → existing Tool Registry
  → existing Tool Executor
  → Zod input validation
  → deterministic handler (no external side effects)
  → existing normalized ToolResult
  → Context Manager with current tool-result budget
  → future LUMO reasoning/router
```

All tools define stable IDs, descriptions, typed input/output schemas, enabled state, and handlers. They request no permissions because they do not use network, files, shell, environment variables, or external services. They are registered beside `web_search` in the existing in-memory registry.

The backend-only `runUtility` procedure invokes a selected registered utility through the Tool System and passes the normalized result through Context Manager. Phase 10 routing separately prepares validated utility plans but does not execute them.

## Security and error behavior

- No `eval`, `Function`, shell execution, filesystem access, network access, secret access, or arbitrary code execution.
- Calculator input is bounded by length and token count; exponent magnitude and non-finite results are rejected.
- Unit conversion uses explicit tables and category compatibility checks.
- Statistics input is bounded and must contain finite numbers.
- Date/time calculations require explicit timezone offsets for date strings and reject invalid or out-of-range values.
- Tool Executor preserves normalized validation and execution failure codes in the existing ToolResult envelope.
- No utility result is written to persistent memory.

## Future routing boundary

Tool descriptions are precise enough for the Phase 10 selector to distinguish calculator, conversion, statistics, date/time, and web-search requests. Each tool remains deterministic and does not contain its own natural-language routing logic. Phase 10 decides when a tool is appropriate and prepares a validated plan; execution remains with the existing Tool Executor.

## Limitations

The date/time utility intentionally avoids a full calendar or timezone database. It operates on ISO timestamps with explicit offsets, uses UTC for timestamp output, and treats day addition as fixed 24-hour arithmetic. Unit data conversion uses binary factors (`KB = 1024 bytes`).
