# Authentication mode for the private LUMO VPS

The approved private VPS deployment does **not** use Google sign-in or any LUMO in-app login. The sign-in route redirects to the workspace, and API authorization derives the single owner from the exact `Tailscale-User-Login` identity injected by Tailscale Serve.

Keep `LUMO_TAILSCALE_ONLY=true`, configure `LUMO_TAILSCALE_OWNER_LOGIN` to the exact Tailscale login for the owner, and keep both frontend and API bound to `127.0.0.1`. Tailscale Serve is the only ingress. Do not expose the service publicly and do not enable Tailscale Funnel.

Do not configure `GOOGLE_SIGNIN_CLIENT_ID`, `GOOGLE_SIGNIN_CLIENT_SECRET`, `GOOGLE_SIGNIN_REDIRECT_URI`, or `OWNER_OPEN_ID` for this login-free mode. The separate Google/Gmail provider connection feature is distinct from LUMO sign-in and should only be enabled after its own credentials, scopes, callback, and authorization policy are reviewed.

For deployment prerequisites and the private APK workflow, see [`PTERODACTYL_SETUP.md`](./PTERODACTYL_SETUP.md).
