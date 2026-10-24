import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Music2, RefreshCw, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Status } from "./ui";
import {
  beginSpotifyConnect,
  disconnectSpotify,
  getSpotifyConnection,
  handleSpotifyCallback,
  SPOTIFY_SCOPES,
  type SpotifyConnection,
} from "@/lib/lumo/spotify";

export function SpotifyConnect() {
  const [connection, setConnection] = useState<SpotifyConnection | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const callback = await handleSpotifyCallback();
      if (callback.error) setError(callback.error);
      setConnection(await getSpotifyConnection());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Spotify could not be reached.");
      setConnection(null);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onChange = () => void refresh();
    window.addEventListener("lumo-spotify-updated", onChange);
    return () => window.removeEventListener("lumo-spotify-updated", onChange);
  }, [refresh]);

  const connect = async () => {
    setBusy(true);
    setError("");
    try {
      await beginSpotifyConnect();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Spotify could not start authorization.");
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
          {!configured && (
            <p className="metadata">
              Add <code>VITE_SPOTIFY_CLIENT_ID</code> and register the redirect URI before
              connecting.
            </p>
          )}
          {configured && !connected && (
            <p className="metadata">
              Requires Spotify authorization and an active playback device for controls.
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
