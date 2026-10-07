# LUMO — Personal AI Companion

A first functional foundation for Peter's personal AI companion. This repository is intentionally a **testing build**, not the final immersive LUMO UI.

## Run locally

```bash
pnpm install
pnpm check
pnpm test
pnpm dev
```

The server listens on `PORT` (default `3000`) and serves the React testing workbench plus the tRPC API.

The managed environment supplies `DATABASE_URL`, `MANUS_API_URL`, and `MANUS_API_KEY` at runtime. The provider key and database connection remain server-only; no client-side code contains them.

Optional server-only settings:

- `LUMO_MODEL` — explicit platform model ID; blank uses the platform default.
- `LUMO_MAX_TOKENS` — response budget, clamped to 4,000.
- `LUMO_TIMEOUT_MS` — request timeout, clamped between 5 and 120 seconds.

## Architecture

`client/src/pages/Home.tsx` → `lumo.send` → `server/lumo/core.ts` → `server/lumo/provider.ts` → the managed platform LLM.

The core retrieves a bounded recent message window and relevant structured memories, then persists completed turns through `DatabaseLumoStorage`. Storage, provider, capability, and permission contracts are separate so future VPS/local adapters and tools can be added without rewriting the UI or orchestration layer.

See [LUMO.md](./LUMO.md) for the data boundaries, future extension points, and development notes.
