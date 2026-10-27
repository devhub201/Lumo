import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Music2, RefreshCw, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Status } from "./ui";
import {
  beginSpotifyConnect,
  disconnectSpotify,
  getSpotifyClientId,
  getSpotifyConnection,
  handleSpotifyCallback,
  listenForSpotifyCallbacks,
  setSpotifyClientId,
  spotifyIsConfigured,
  spotifyRedirectUri,
  SPOTIFY_SCOPES,
  type SpotifyConnection,
  type SpotifyOAuthCallbackResult,
} from "@/lib/lumo/spotify";
import { isOnDeviceAiNative } from "@/lib/lumo/local-ai";

export function SpotifyOAuthCallbackListener() {
  useEffect(() => {
    let active = true;
    let stop: (() => void) | undefined;
    void listenForSpotifyCallbacks((result) => {
      if (active) {
        window.dispatchEvent(
          new CustomEvent<SpotifyOAuthCallbackResult>("lumo-spotify-callback", { detail: result }),
        );
      }
    })
      .then((remove) => {
        if (active) stop = remove;
        else remove();
      })
      .catch((error: unknown) => {
        if (!active) return;
        window.dispatchEvent(
          new CustomEvent<SpotifyOAuthCallbackResult>("lumo-spotify-callback", {
            detail: {
              handled: true,
              error: error instanceof Error ? error.message : "Spotify sign-in could not resume.",
            },
          }),
        );
      });
    return () => {
      active = false;
      stop?.();
    };
  }, []);
  return null;
}

export function SpotifyConnect() {
  const [connection, setConnection] = useState<SpotifyConnection | null>(null);
  const [clientIdInput, setClientIdInput] = useState(() => getSpotifyClientId());
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const onDeviceAi = isOnDeviceAiNative();

  const refresh = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const callback = await handleSpotifyCallback();
      if (callback.error) setError(callback.error);
      setConnection(await getSpotifyConnection());
      setClientIdInput(getSpotifyClientId());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Spotify could not be reached.");
      setConnection({
        configured: spotifyIsConfigured(),
        connected: false,
        scopes: [...SPOTIFY_SCOPES],
      });
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onChange = () => void refresh();
    const onCallback = (event: Event) => {
      const result = (event as CustomEvent<SpotifyOAuthCallbackResult>).detail;
      void refresh().then(() => {
        if (result?.error) setError(result.error);
      });
    };
    window.addEventListener("lumo-spotify-updated", onChange);
    window.addEventListener("lumo-spotify-callback", onCallback);
    return () => {
      window.removeEventListener("lumo-spotify-updated", onChange);
      window.removeEventListener("lumo-spotify-callback", onCallback);
    };
  }, [refresh]);

  const saveClientId = () => {
    setError("");
    try {
      setSpotifyClientId(clientIdInput);
      void refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Spotify Client ID could not be saved.");
    }
  };

  const connect = async () => {
    setBusy(true);
    setError("");
    try {
      await beginSpotifyConnect();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Spotify could not start authorization.");
    } finally {
      setBusy(false);
    }
  };

  const disconnect = () => {
    disconnectSpotify();
    setConnection((current) => (current ? { ...current, connected: false } : current));
  };

  const configured = connection?.configured ?? false;
  const connected = connection?.connected ?? false;
  return (
    <div className="spotify-connect" aria-live="polite">
      <div className="integration-row spotify-row">
        <span className="tool-icon spotify-mark" aria-hidden="true">
          <Music2 />
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <strong>Spotify</strong>
            {busy && !connection ? (
              <span className="metadata">Checking connection…</span>
            ) : !configured ? (
              <Status warning>Setup required</Status>
            ) : connected ? (
              <Status>Connected</Status>
            ) : (
              <Status warning>Not connected</Status>
            )}
          </div>
          <p>Play music, read playback state, and control your active Spotify device.</p>
          {connected && connection?.displayName && (
            <p className="metadata">
              {connection.displayName} ·{" "}
              {connection.product === "premium" ? "Premium" : connection.product || "Account"}
            </p>
          )}
          {!configured && !onDeviceAi && (
            <p className="metadata">
              Add <code>VITE_SPOTIFY_CLIENT_ID</code> and register the redirect URI before
              connecting.
            </p>
          )}
          {configured && !connected && (
            <p className="metadata">
              Authorize Spotify and open the Spotify app or another active playback device.
            </p>
          )}
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="integration-actions">
          {connected ? (
            <Button size="sm" variant="outline" onClick={disconnect} disabled={busy}>
              <Unplug /> Disconnect
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => void connect()}
              disabled={busy || !configured}
            >
              {busy ? "Checking…" : "Connect Spotify"}
            </Button>
          )}
        </div>
      </div>
      {onDeviceAi && (
        <div className="spotify-client-setup">
          <label htmlFor="spotify-client-id">Spotify Developer app Client ID</label>
          <div className="spotify-client-entry">
            <input
              id="spotify-client-id"
              className="text-input"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="Paste Client ID"
              value={clientIdInput}
              onChange={(event) => setClientIdInput(event.target.value)}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy || clientIdInput.trim() === getSpotifyClientId()}
              onClick={saveClientId}
            >
              Save ID
            </Button>
          </div>
          <p>
            Client ID is public. Don’t enter a Spotify Client Secret, password, or access token. In
            Spotify Developer Dashboard, register this exact redirect URI and add your Spotify
            account to Users and Access:
          </p>
          <code className="spotify-redirect-uri">{spotifyRedirectUri()}</code>
          <p>
            Spotify Development Mode requires the app owner to have Premium; playback control also
            needs Premium and an active Spotify device.
          </p>
        </div>
      )}
      {configured && (
        <div className="spotify-permission-note">
          <span>Requested permissions</span>
          <div>
            {SPOTIFY_SCOPES.map((scope) => (
              <code key={scope}>{scope}</code>
            ))}
          </div>
          <a href="https://www.spotify.com/account/apps/" target="_blank" rel="noreferrer">
            Manage Spotify access <ExternalLink />
          </a>
          {connected && (
            <Button variant="ghost" size="sm" onClick={() => void refresh()} disabled={busy}>
              <RefreshCw /> Refresh
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
