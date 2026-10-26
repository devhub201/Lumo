# LUMO private VPS deployment

This deployment intentionally has **no LUMO/Google sign-in screen**. Access is restricted to the configured Tailscale account. Tailscale Serve provides a private HTTPS `*.ts.net` address; the app and API processes bind only to `127.0.0.1`. Do not enable Tailscale Funnel or expose the Node ports publicly.

## Runtime and startup

Use Ubuntu with Node.js 22 and pnpm 10.18.0. From the repository root:

```bash
corepack enable
corepack prepare pnpm@10.18.0 --activate
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm build
```

The production supervisor is `pnpm start`. It requires the private-mode settings below, keeps the API on loopback (`LUMO_API_PORT`, default `PORT + 1`), and starts the frontend on loopback at `PORT` for Tailscale Serve to proxy. Run the process under a persistent service manager such as systemd.

Configure Tailscale Serve to proxy the HTTPS tailnet hostname to the local frontend port only after the app is healthy. Serve is private to tailnet devices and remains subject to the tailnet's existing access policy. Do not use Funnel.

## Private runtime configuration

Store these in a root-readable environment file (for example `/etc/lumo/lumo.env`) or a protected service-manager environment. Never commit or paste secrets into GitHub, Android build arguments, logs, or chat.

```text
NODE_ENV=production
PORT=3000
LUMO_API_PORT=3001
LUMO_TAILSCALE_ONLY=true
LUMO_TAILSCALE_OWNER_LOGIN=<exact Tailscale login email>
LUMO_PUBLIC_ORIGIN=https://<vps-device>.<tailnet>.ts.net
DATABASE_URL=<private MySQL/MariaDB connection URL>
OPENAI_API_KEY=<server-only OpenAI key>
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
```

`LUMO_TAILSCALE_OWNER_LOGIN` must exactly match the identity header added by Tailscale Serve. Requests with a missing or different identity are rejected. The frontend and API must stay on loopback; do not make either port a public listener. `LUMO_PUBLIC_ORIGIN` must be the exact root HTTPS `*.ts.net` origin.

No Google sign-in credentials, `OWNER_OPEN_ID`, Manus session secret, or client-side OpenAI key are required for this mode. `OPENAI_API_KEY` is used only by the backend. The Android app does not contain it.

## Database safety

LUMO persistence uses MySQL/MariaDB. Use a **new, dedicated, empty LUMO database** for this VPS; do not point it at an existing or unknown database. After verifying the configured `DATABASE_URL` targets that new database, apply the checked-in schema migrations with:

```bash
pnpm db:migrate
```

Do not run `pnpm db:push` against production data. Keep MariaDB bound to loopback or a private interface and use a separate least-privilege database user for LUMO.

## Android app

Build with `LUMO_CAPACITOR_SERVER_URL` set to the private root HTTPS `*.ts.net` origin. The APK is an online client: the Android device must have Tailscale installed and be signed into the same authorized tailnet to reach LUMO. GitHub-hosted Actions cannot probe a tailnet-only endpoint; the workflow checks the URL format and verifies the generated installable debug APK, while reachability must be confirmed from the enrolled Android device.

The workflow produces a debug-signed APK, not a production-signed release. Do not publish a release until a real APK has been built and verified as installable.
