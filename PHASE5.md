# LUMO Phase 5 — Tool Architecture

Phase 5 adds the centralized tool foundation without implementing any individual tool or changing the testing UI.

## Architecture

LUMO tools are explicitly registered application capabilities. A future request flows through `ToolSystem` to `ToolExecutor`, which obtains a registered definition, validates structured input, verifies enabled state and permissions, invokes the isolated handler, validates structured output, and returns a normalized result to the core.

The registry stores metadata and handlers separately from the executor. The executor never evaluates arbitrary code, shell commands, model-provided definitions, secrets, or environment values. A tool can only run if application code has registered it.

## Modules

`server/lumo/tools/contracts.ts` defines tool metadata, permissions, handlers, execution context, public catalog metadata, and normalized result types. `registry.ts` provides duplicate-safe registration and enable/disable controls. `permissions.ts` provides explicit allowlist and default-deny permission checkers. `executor.ts` owns the lifecycle and safe diagnostics. `results.ts` creates stable success/error envelopes. `system.ts` exposes the empty application registry and executor as LUMO's replaceable tool-system boundary.

## Diagnostics and privacy

The executor logs tool requested, validation failed, permission denied, execution started, execution completed, and execution failed events with request IDs and duration. It deliberately does not log arguments, outputs, prompts, secrets, API keys, environment variables, or raw exceptions.

## No tools are implemented yet

The application registry is intentionally empty. Web search, calculator, time/date, files, documents, camera, vision, microphone, voice, blueprints, external APIs, and workflows remain future tools. The existing conversation, memory, personality, database, and UI behavior are unchanged.

## Registering a future tool

A future server module can register a tool once at startup:

```ts
registry.register({
  id: "example.lookup",
  name: "Example lookup",
  description: "Looks up an explicitly supported value.",
  category: "data",
  inputSchema: z.object({ query: z.string().min(1) }),
  outputSchema: z.object({ value: z.string() }),
  permissions: ["network"],
  enabled: true,
  handler: async ({ query }) => ({ value: await safeLookup(query) }),
});
```

The future tool does not need to modify LUMO Core or duplicate permission, validation, error, or logging logic.
