# Spotify setup for LUMO

The frontend includes a real Spotify Web API Authorization Code with PKCE flow. It never uses or ships a Spotify client secret. Spotify tokens remain in the browser session and are not rendered in the UI or written to logs.

## Public configuration

Set the following public Vite variable before starting the frontend:

```sh
VITE_SPOTIFY_CLIENT_ID=your_spotify_app_client_id
```

You may optionally set an exact redirect URI:

```sh
VITE_SPOTIFY_REDIRECT_URI=https://your-lumo-host.example/settings
```

If it is omitted, LUMO uses `${window.location.origin}/settings`.

Register the exact same URI in the Spotify Developer Dashboard. For local development, register:

```text
http://localhost:8080/settings
```

For a deployed preview, register the exact HTTPS origin and `/settings` path, for example:

```text
https://your-lumo-host.example/settings
```

## Requested scopes

LUMO requests `user-read-private`, `user-read-email`, `user-read-currently-playing`, `user-read-playback-state`, and `user-modify-playback-state`.

Playback control also depends on the account having Spotify Premium and an active available playback device. A denied scope, expired browser session, unavailable device, API error, or missing client ID is shown as an unavailable/error state; the UI does not claim playback succeeded without a confirmed Spotify response.

The browser flow is intentionally separate from the existing LUMO backend adapter. If the production product needs server-side account persistence, cross-device sessions, or organization-wide revocation, the backend must add an owner-bound Spotify OAuth exchange and encrypted token storage; this frontend does not pretend that server capability exists.
