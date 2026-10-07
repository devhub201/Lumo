# LUMO testing build

This repository is the first functional foundation for Peter's personal AI companion. It is intentionally a **testing build**, not the final immersive LUMO environment.

## What exists now

- A modular LUMO Core that keeps orchestration separate from the provider and storage adapters.
- One server-side AI provider: the managed platform LLM endpoint through `invokeLLM`.
- Structured conversations and ordered messages in managed MySQL.
- Structured persistent memories with bounded lexical retrieval.
- A minimal workbench UI for conversations, diagnostics, memory creation, loading states, retries, and context inspection.
- Future capability contracts for tools, files, web, vision, voice, and blueprints; those capabilities are not implemented yet.
- Safe structured logs and user-safe error mapping.

## Local development

```bash
pnpm install
pnpm check
pnpm test
pnpm dev
```

The app listens on `PORT` (default `3000`). The managed Webdev environment supplies `DATABASE_URL`, `MANUS_API_URL`, and `MANUS_API_KEY` at runtime. These values must remain server-side.

Optional LUMO settings:

- `LUMO_MODEL` — explicit platform model ID; blank uses the platform default.
- `LUMO_MAX_TOKENS` — response budget, clamped to 4,000.
- `LUMO_TIMEOUT_MS` — request timeout, clamped between 5 and 120 seconds.

## Core request path

`Home.tsx` → `lumo.send` tRPC procedure → `createLumoCore` → `ManagedLumoProvider` → platform LLM. Core retrieves only a bounded recent history and relevant memories, then writes the completed user/assistant turn through `DatabaseLumoStorage`.

## Data boundaries

- `lumo_conversations`: owner-scoped conversation metadata and progressive explanation depth.
- `lumo_messages`: ordered user/assistant turns and safe diagnostic metadata.
- `lumo_memories`: structured preference/fact/project/summary/knowledge records.
- `lumo_settings`: reserved owner-scoped settings boundary for future configuration.

The current testing UI uses the fixed owner key `peter`; this is deliberate for a one-user foundation and is not a substitute for a future authentication/permission layer.
