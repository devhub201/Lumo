# LUMO frontend/backend integration

The frontend is a Node-hosted TanStack Start app. In the private VPS deployment, Tailscale Serve forwards its HTTPS `*.ts.net` origin to the frontend bound on `127.0.0.1`; the frontend proxies `/api/*` and `/manus-storage/*` to the Express API, which also listens only on loopback. No public Node port is opened.

The app uses relative same-origin requests such as `POST /api/trpc/lumo.send`. There is no LUMO/Google login screen or app session requirement in this deployment. Tailscale Serve injects the verified `Tailscale-User-Login` identity; both the web entry and protected API require an exact match to `LUMO_TAILSCALE_OWNER_LOGIN`. The configured owner is derived server-side, never from request data.

`VITE_LUMO_BACKEND_ORIGIN` is an optional development override only. Do not set a guessed, public, or temporary origin in the Android build. Production uses the actual private HTTPS Tailscale hostname for the app and API.

## Server-only data and AI provider

Set `OPENAI_API_KEY` only in a root-readable server environment file or protected service manager; it is never included in the frontend build or APK. Persistent conversations and memories require a dedicated MySQL/MariaDB `DATABASE_URL`. Use a new LUMO-only database for this VPS and do not point it at an existing or unknown database.

Use `LUMO_TAILSCALE_ONLY=true`, `LUMO_TAILSCALE_OWNER_LOGIN=<exact tailnet login>`, and `LUMO_PUBLIC_ORIGIN=https://<device>.<tailnet>.ts.net`. Keep the frontend and API bound to loopback and use Tailscale Serve as the sole ingress. Do not enable Funnel.

For VPS startup, database safety, HTTPS, and Android requirements, see [`PTERODACTYL_SETUP.md`](../PTERODACTYL_SETUP.md).
