# Google sign-in setup for LUMO

LUMO's Google sign-in flow requests only `openid email profile`. It does not grant Gmail API access; Gmail remains a separate owner-bound integration. The web flow exchanges Google's authorization code on the server, validates the state cookie and verified identity, then allows only the exact `OWNER_OPEN_ID` configured on the server to receive an application session.

## Server-only variables

```text
GOOGLE_SIGNIN_CLIENT_ID
GOOGLE_SIGNIN_CLIENT_SECRET
GOOGLE_SIGNIN_REDIRECT_URI
OWNER_OPEN_ID
DATABASE_URL
MANUS_PROJECT_ID
MANUS_JWT_SECRET
LUMO_PUBLIC_ORIGIN
```

The client secret, database URL, JWT secret, and owner identity belong only in protected server settings. Do not paste them into the repository, frontend environment, or chat.

For local development only, the callback may be:

```text
http://localhost:3000/api/auth/google/callback
```

Production must use the final verified HTTPS app origin, and the configured public origin must match it exactly:

```text
LUMO_PUBLIC_ORIGIN=https://<verified-app-origin>
GOOGLE_SIGNIN_REDIRECT_URI=https://<verified-app-origin>/api/auth/google/callback
```

Register that exact callback URI in the Google OAuth client. The production backend reports Google sign-in unavailable if the callback does not match the configured HTTPS origin or if the database, project ID, session secret, or owner identity is missing.

`OWNER_OPEN_ID` must match the exact identity emitted by this backend, in the form `google:<sub>`. Do not use an email address or database row ID. If the identity does not match, the callback returns `403 private_owner_only` before creating a user or session. Do not weaken this gate to make first sign-in easier.

## Android sign-in

The Android wrapper opens Google authorization in the system browser/Custom Tab, not the embedded WebView. Google returns to the backend's HTTPS callback. After the owner check, the backend redirects to `com.devhub201.lumo://auth/callback` with a short-lived one-time code. The app exchanges that code through the same-origin API using an S256 PKCE verifier. The deep link never carries the session token.

The Android callback route and exchange have automated code checks, but provider sign-in still requires real Google client configuration and a real-device test. Keep the callback HTTPS origin reachable and stable while the browser flow is in progress.

Gmail permissions remain separate and are not included in the sign-in scopes. The frontend never receives the Google client secret or the server session signing key.
