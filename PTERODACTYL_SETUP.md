# LUMO on Pterodactyl

This repository combines the existing Express/tRPC backend, the supplied standalone frontend, and the already-existing Android project. Production uses one public Pterodactyl allocation: the frontend Node SSR server binds to the allocated `PORT`, while the API binds to loopback on `LUMO_API_PORT` (default: `PORT + 1`). The frontend proxies `/api/*` and `/manus-storage/*` internally, preserving one browser origin and avoiding a public API port or production CORS setup.

## Install and build

Use a Node.js 22 server image and pnpm 10.18.0. From the repository root:

```bash
corepack enable
corepack prepare pnpm@10.18.0 --activate
pnpm install --frozen-lockfile
pnpm build
```

Set the Pterodactyl startup command to:

```bash
pnpm start
```

The server environment must provide the allocated public `PORT` and `NODE_ENV=production`. `LUMO_API_PORT` is optional; if specified, it must be a different loopback port. The startup supervisor checks the private API health endpoint, launches both processes, and shuts both down together. Do not expose the API port as a public allocation unless a later reviewed architecture explicitly requires it.

## Database safety

Configure `DATABASE_URL` only in the panel's protected environment settings. Before any migration, inspect the target database, confirm whether it is empty or backed up, and obtain separate approval. This task does not authorize a migration against an existing or unknown database.

The approved migration command, only after that separate review and approval, is:

```bash
pnpm db:migrate
```

Do not use `pnpm db:push` against production data.

## Required server variables

Set these through Pterodactyl Startup variables or an equivalent protected environment. Never put secrets in the frontend build, repository, issues, or chat.

```text
NODE_ENV=production
PORT=<the allocated public port>
LUMO_API_PORT=<optional private loopback port; defaults to PORT+1>
LUMO_PUBLIC_ORIGIN=https://<verified-app-origin>
DATABASE_URL=<private MySQL/MariaDB URL>
MANUS_PROJECT_ID=<real server-side project ID>
MANUS_JWT_SECRET=<private session signing secret>
OWNER_OPEN_ID=<exact owner identity, e.g. google:<sub>>
OPENAI_API_KEY=<server-only OpenAI key>
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
GOOGLE_SIGNIN_CLIENT_ID=<Google OAuth client ID>
GOOGLE_SIGNIN_CLIENT_SECRET=<server-only Google OAuth secret>
GOOGLE_SIGNIN_REDIRECT_URI=https://<verified-app-origin>/api/auth/google/callback
```

`LUMO_PUBLIC_ORIGIN` must be the exact HTTPS origin with no path, query, or fragment. Production state-changing requests are accepted only when their browser `Origin` matches it. Production session cookies use `SameSite=Lax`; do not disable the origin check to work around a misconfigured domain or proxy. Google sign-in is unavailable unless its callback matches this same origin and the database, project ID, session secret, and owner allowlist are present.

`OWNER_OPEN_ID` is case-sensitive and must equal the provider identity exactly; for the implemented Google sign-in route the format is `google:<sub>`. An email address or database row ID is not a substitute. Google callback identity must be verified and must match this allowlist before the backend creates a user or session. Google sign-in asks only for `openid email profile`; Gmail permissions are separate and are not requested by sign-in.

On Android, Google authorization opens the Android system browser/Custom Tab rather than the embedded WebView. The server redirects back to `com.devhub201.lumo://auth/callback` with a short-lived, one-time handoff code. The app redeems it through the same-origin backend using PKCE; the session token is never placed in the deep link. Test this flow on a real device with the configured Google client before treating sign-in as verified.

`OPENAI_API_KEY` is consumed only by the backend. If it is absent, the backend may use its existing Manus provider fallback, which separately requires valid Manus API settings. `MANUS_OAUTH_API_URL` is needed only if using the legacy Manus OAuth route.

Optional GitHub/Gmail connection credentials and the encryption key are separate features. Do not set them until their providers, scopes, callbacks, and server-side encryption key are ready.

## HTTPS and public URL

The repository does not contain a confirmed domain or Pterodactyl panel allocation URL. Do not invent one. Google production OAuth and the Android build require the actual app origin to be public and HTTPS with a valid certificate. The final setup must be chosen after inspecting the user's Pterodactyl panel, allocations, provider TLS/reverse-proxy options, and any domain they control.

The Google OAuth callback must match the real URL exactly:

```text
https://<verified-app-origin>/api/auth/google/callback
```

The Capacitor build refuses to proceed unless `LUMO_CAPACITOR_SERVER_URL` is set to the root HTTPS URL. The manual Android workflow also fetches `/api/health` and `/` from the runner, requires the API health response and LUMO HTML page, then builds and verifies the installable **debug APK**. That APK is not a production-signed release; a production-signed package needs a private release keystore and separate signing configuration.

## Health check

After startup, check the public allocation and the local process health route:

```bash
curl -fsS "http://127.0.0.1:${PORT}/api/health"
```

Expected response:

```json
{ "status": "ok" }
```

Also test the verified HTTPS origin from outside Pterodactyl. A local health response alone does not prove public DNS, TLS, Google callback, database, or OpenAI configuration works.
