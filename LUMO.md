# LUMO testing build

This repository is the first functional foundation for Peter's personal AI companion. It is intentionally a **testing build**, not the final immersive LUMO environment.

## What exists now

- A modular LUMO Core that keeps orchestration separate from the provider and storage adapters.
- One server-side AI provider: the managed platform LLM endpoint through `invokeLLM`.
- Structured conversations and ordered messages in managed MySQL.
- Structured persistent memories with bounded lexical retrieval.
- A minimal workbench UI for conversations, diagnostics, memory creation, loading states, retries, and context inspection.
- Registered tools include deterministic utilities, bounded web search, and the Phase 11 managed Files / Document Intelligence subsystem.
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
- `LUMO_FILES_ROOT` — optional server-only root for managed owner-scoped file workspaces.
- `LUMO_VISION_MODEL` — optional server-only vision-capable model override.

## Core request path

`Home.tsx` → `lumo.send` tRPC procedure → `createLumoCore` → `ManagedLumoProvider` → platform LLM. Core retrieves only a bounded recent history and relevant memories, then writes the completed user/assistant turn through `DatabaseLumoStorage`.

## Data boundaries

- `lumo_conversations`: owner-scoped conversation metadata and progressive explanation depth.
- `lumo_messages`: ordered user/assistant turns and safe diagnostic metadata.
- `lumo_memories`: structured preference/fact/project/summary/knowledge records.
- `lumo_settings`: reserved owner-scoped settings boundary for future configuration.
- Managed files: an owner-hashed workspace with a manifest and stable generated file IDs; no caller-supplied filesystem paths.

The current testing UI uses the fixed owner key `peter`; this is deliberate for a one-user foundation and is not a substitute for a future authentication/permission layer.

## Phase 11 managed files and document intelligence

Phase 11 supports TXT, Markdown, JSON, CSV, PDF, and DOCX files. Names and extensions are validated, content is capped at 1 MB, and reads/searches/summaries are bounded. PDF extraction uses `pdftotext` when available; DOCX extraction reads only `word/document.xml` through `unzip`.

The registered tools are `file_list`, `file_read`, `file_search`, `document_summarize`, `document_extract`, `document_create`, `file_save`, and `file_metadata`. They require the `files` permission and use the existing Tool Registry, Executor, permission checks, normalized fault handling, and deterministic router. Document results pass through the existing Context Manager with an explicit untrusted-document-data wrapper. Document text is never treated as system instructions and is not written to long-term memory automatically.

## Phase 12+13 vision and camera foundation

Vision uses a provider-neutral adapter and normalized `VisionResult` contract. It supports validated user upload data URLs, image files in the Phase 11 managed workspace, and one explicit camera-captured frame. Supported image formats are PNG, JPEG/JPG, WebP, and GIF; inputs are checked for MIME, magic bytes, size, dimensions, and malformed data before provider access.

`vision_analyze` and `camera_capture` use the existing Tool Registry, Executor, permissions, normalized errors, deterministic router, and Context Manager. `camera_capture` accepts a frame only after the browser-side camera adapter has obtained permission and captured one image; it never opens a camera, streams frames, or uploads continuously. Visual descriptions and OCR are wrapped as untrusted visual data, never become system instructions, and are not automatically stored in long-term memory. Provider responses do not receive invented detections or confidence scores, and unavailable providers return safe normalized failures.
