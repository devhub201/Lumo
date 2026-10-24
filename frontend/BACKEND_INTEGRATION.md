# LUMO frontend/backend integration

The standalone LUMO frontend in `frontend/` is built as a Node-hosted TanStack Start application. The production supervisor runs it on the Pterodactyl public allocation and keeps the Express API on a loopback-only port. The frontend server proxies `/api/*` and `/manus-storage/*` to that private API, so the browser and Android WebView use one origin, session cookies remain same-origin, and production CORS is not needed.

The frontend uses relative requests by default:

- `POST /api/trpc/lumo.send` for backend-owned chat and persistence.
- `GET /api/auth/google/start` for server-side Google OpenID Connect sign-in.
- The backend's HttpOnly session cookie for protected tRPC calls.

`VITE_LUMO_BACKEND_ORIGIN` is an optional override for isolated development only. Do not set it to a guessed or temporary public URL for production. The app and API must be served behind the same verified HTTPS origin.

## Private owner and AI provider

The backend supports the server-only OpenAI-compatible provider. Set `OPENAI_API_KEY` only in Pterodactyl's protected Startup variables or an equivalent secret store; it is never included in frontend build variables. The API must also have `DATABASE_URL`, `MANUS_PROJECT_ID`, and `MANUS_JWT_SECRET` for persisted data and signed sessions.

Google sign-in requests only `openid email profile`, does not grant Gmail access, and is owner-gated before creating a user or session. Set `OWNER_OPEN_ID` to the exact Google identity emitted by the backend (`google:<sub>`); an email address alone is not accepted. Configure the callback as the exact HTTPS app origin plus `/api/auth/google/callback`. The Google client secret remains server-side.

The repository's Pterodactyl guide lists the full environment and startup requirements. Do not run database migrations against an existing or unknown database without first inspecting it, confirming backup/emptiness, and obtaining separate approval.
