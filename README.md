# LUMO — Personal AI Workspace

LUMO combines the supplied TanStack frontend, Express/tRPC backend, persistent conversation and memory storage, and the existing Capacitor Android project.

## Local development

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm dev
```

For production, build with `pnpm build` and run `pnpm start` under a persistent process manager. Production startup intentionally fails closed unless Tailscale-only mode, the exact Tailscale owner identity, and a root HTTPS `*.ts.net` origin are configured. The frontend and API bind to loopback; Tailscale Serve is the only ingress. No LUMO/Google login screen is used in this mode.

## AI and persistence

Configure `OPENAI_API_KEY` only in the server environment. The API key is not embedded in the browser bundle or APK. LUMO conversation and memory persistence requires MySQL/MariaDB through `DATABASE_URL`; use a dedicated empty LUMO database rather than an existing or unknown database.

## Android

The Capacitor APK is an online client for the private Tailscale HTTPS origin. Android must have Tailscale installed and be signed into the authorized tailnet. GitHub Actions can build and verify the installable debug APK but cannot access or probe a private tailnet endpoint. See [`PTERODACTYL_SETUP.md`](./PTERODACTYL_SETUP.md) and [`frontend/BACKEND_INTEGRATION.md`](./frontend/BACKEND_INTEGRATION.md).
