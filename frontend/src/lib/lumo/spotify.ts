import {
  getIntegrations,
  type LumoMusicAdapter,
  type MusicAction,
  type MusicState,
  type MusicTrack,
} from "./integrations";

import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";

const AUTH_URL = "https://accounts.spotify.com/authorize";
const TOKEN_URL = "https://accounts.spotify.com/api/token";
const API_URL = "https://api.spotify.com/v1";
const CLIENT_ID_STORAGE_KEY = "lumo.spotify.client_id";
const SPOTIFY_ANDROID_REDIRECT_URI = "com.devhub201.lumo://spotify-callback";
const STORAGE = {
  access: "lumo.spotify.access_token",
  refresh: "lumo.spotify.refresh_token",
  expires: "lumo.spotify.expires_at",
  verifier: "lumo.spotify.pkce_verifier",
  state: "lumo.spotify.oauth_state",
  startedAt: "lumo.spotify.oauth_started_at",
};

export const SPOTIFY_SCOPES = [
  "user-read-private",
  "user-read-email",
  "user-read-currently-playing",
  "user-read-playback-state",
  "user-modify-playback-state",
] as const;

export type SpotifyConnection = {
  configured: boolean;
  connected: boolean;
  account?: string;
  displayName?: string;
  product?: string;
  scopes: string[];
  expiresAt?: number;
};

type SpotifyToken = {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
};
type SpotifyProfile = {
  id: string;
  display_name?: string | null;
  email?: string | null;
  product?: string | null;
};
type SpotifyPlayer = {
  is_playing: boolean;
  progress_ms: number;
  item?: {
    id: string;
    uri: string;
    name: string;
    duration_ms: number;
    artists?: Array<{ name: string }>;
    album?: { images?: Array<{ url: string }> };
  } | null;
  device?: { id?: string | null; name?: string; is_active?: boolean; type?: string } | null;
  shuffle_state: boolean;
  repeat_state: "track" | "context" | "off";
};

const isBrowser = () => typeof window !== "undefined";
const configStorage = () => (isBrowser() ? window.localStorage : undefined);
const configuredClientId = () =>
  configStorage()?.getItem(CLIENT_ID_STORAGE_KEY)?.trim() ||
  (import.meta.env["VITE_SPOTIFY_CLIENT_ID"] as string | undefined)?.trim() ||
  "";
const configuredRedirectUri = () => {
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android") {
    return SPOTIFY_ANDROID_REDIRECT_URI;
  }
  return (
    (import.meta.env["VITE_SPOTIFY_REDIRECT_URI"] as string | undefined)?.trim() ||
    (isBrowser() ? `${window.location.origin}/settings` : "")
  );
};
const storage = () => (isBrowser() ? window.localStorage : undefined);
const authStorage = () => (isBrowser() ? window.localStorage : undefined);
const emitChange = () => {
  if (isBrowser()) window.dispatchEvent(new CustomEvent("lumo-spotify-updated"));
};

export function getSpotifyClientId() {
  return configuredClientId();
}

export function setSpotifyClientId(value: string) {
  const next = value.trim();
  const previous = configuredClientId();
  const config = configStorage();
  if (!config) throw new Error("Spotify settings are unavailable in this browser.");
  if (next) config.setItem(CLIENT_ID_STORAGE_KEY, next);
  else config.removeItem(CLIENT_ID_STORAGE_KEY);
  if (previous !== next) clearToken();
  emitChange();
}

export function spotifyRedirectUri() {
  return configuredRedirectUri();
}

function base64Url(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function randomString(length = 64) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

async function challenge(verifier: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

function clearToken() {
  const s = storage();
  s?.removeItem(STORAGE.access);
  s?.removeItem(STORAGE.refresh);
  s?.removeItem(STORAGE.expires);
  emitChange();
}

function readAccessToken() {
  const s = storage();
  const token = s?.getItem(STORAGE.access);
  const expiresAt = Number(s?.getItem(STORAGE.expires) || 0);
  return token && expiresAt > Date.now() + 20_000 ? token : undefined;
}

function mapTrack(item: SpotifyPlayer["item"]): MusicTrack | undefined {
  if (!item) return undefined;
  const track: MusicTrack = {
    id: item.id,
    uri: item.uri,
    title: item.name,
    artist: item.artists?.map((artist) => artist.name).join(", ") || "Unknown artist",
    durationMs: item.duration_ms,
  };
  const artworkUrl = item.album?.images?.[0]?.url;
  if (artworkUrl) track.artworkUrl = artworkUrl;
  return track;
}

function mapPlayer(player: SpotifyPlayer): MusicState | undefined {
  const track = mapTrack(player.item);
  if (!track) return undefined;
  return {
    track,
    positionMs: player.progress_ms || 0,
    isPlaying: !!player.is_playing,
    shuffle: !!player.shuffle_state,
    repeat: player.repeat_state !== "off",
    queue: [],
  };
}

async function parseError(response: Response) {
  let detail = "Spotify did not complete the request.";
  try {
    const body = (await response.json()) as { error?: { message?: string } | string };
    if (typeof body.error === "string") detail = body.error;
    else if (body.error?.message) detail = body.error.message;
  } catch {
    // Keep the safe generic message when Spotify returns no JSON body.
  }
  if (response.status === 401) return "Spotify authorization expired. Reconnect Spotify.";
  if (response.status === 403)
    return "Spotify denied this action. A Premium account and an active device may be required.";
  if (response.status === 404) return "Spotify could not find an active playback device.";
  return detail;
}

class SpotifyTokenRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "SpotifyTokenRequestError";
  }
}

async function requestToken(body: URLSearchParams) {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) throw new SpotifyTokenRequestError(await parseError(response), response.status);
  return (await response.json()) as SpotifyToken;
}

async function refreshToken() {
  const clientId = configuredClientId();
  const refresh = storage()?.getItem(STORAGE.refresh);
  if (!clientId || !refresh) return undefined;
  let token: SpotifyToken;
  try {
    token = await requestToken(
      new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refresh,
        client_id: clientId,
      }),
    );
  } catch (error) {
    if (
      error instanceof SpotifyTokenRequestError &&
      (error.status === 400 || error.status === 401)
    ) {
      clearToken();
      throw new Error("Spotify rejected the saved session. Please reconnect Spotify.");
    }
    throw error;
  }
  const s = storage();
  s?.setItem(STORAGE.access, token.access_token);
  s?.setItem(STORAGE.expires, String(Date.now() + token.expires_in * 1000));
  if (token.refresh_token) s?.setItem(STORAGE.refresh, token.refresh_token);
  emitChange();
  return token.access_token;
}

async function accessToken() {
  if (!configuredClientId()) return undefined;
  const current = readAccessToken();
  if (current) return current;
  return refreshToken();
}

async function api<T>(path: string, init: RequestInit = {}, retry = true): Promise<T | undefined> {
  const token = await accessToken();
  if (!token) return undefined;
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) },
  });
  if (response.status === 204) return undefined;
  if (response.status === 401 && retry) {
    await refreshToken();
    return api<T>(path, init, false);
  }
  if (!response.ok) throw new Error(await parseError(response));
  return (await response.json()) as T;
}

export function spotifyIsConfigured() {
  return !!configuredClientId();
}

export function spotifyIsConnected() {
  return !!readAccessToken() || !!storage()?.getItem(STORAGE.refresh);
}

export async function beginSpotifyConnect() {
  if (!isBrowser()) throw new Error("Spotify can only be connected from a browser.");
  const clientId = configuredClientId();
  if (!clientId) throw new Error("Enter your Spotify Developer app Client ID first.");
  const verifier = randomString();
  const state = randomString(32);
  const auth = authStorage();
  if (!auth) throw new Error("Secure Spotify authorization storage is unavailable.");
  auth.setItem(STORAGE.verifier, verifier);
  auth.setItem(STORAGE.state, state);
  auth.setItem(STORAGE.startedAt, String(Date.now()));
  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: configuredRedirectUri(),
    state,
    scope: SPOTIFY_SCOPES.join(" "),
    code_challenge_method: "S256",
    code_challenge: await challenge(verifier),
  }).toString();
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android") {
    await Browser.open({ url: url.toString() });
  } else {
    window.location.assign(url.toString());
  }
}

function isSpotifyCallbackUrl(value: string) {
  try {
    const candidate = new URL(value);
    const expected = new URL(SPOTIFY_ANDROID_REDIRECT_URI);
    return (
      candidate.protocol === expected.protocol &&
      candidate.hostname === expected.hostname &&
      candidate.pathname === expected.pathname
    );
  } catch {
    return false;
  }
}

export type SpotifyOAuthCallbackResult = { handled: boolean; error?: string };

export async function handleSpotifyCallback(
  callbackUrl?: string,
): Promise<SpotifyOAuthCallbackResult> {
  if (!isBrowser()) return { handled: false };
  if (callbackUrl && !isSpotifyCallbackUrl(callbackUrl)) return { handled: false };
  const url = new URL(callbackUrl || window.location.href);
  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  const denied = url.searchParams.get("error");
  if (!code && !denied) return { handled: false };
  if (!callbackUrl) {
    const cleanUrl = `${url.origin}${url.pathname}`;
    window.history.replaceState({}, document.title, cleanUrl);
  }
  const auth = authStorage();
  const expectedState = auth?.getItem(STORAGE.state);
  const verifier = auth?.getItem(STORAGE.verifier);
  const startedAt = Number(auth?.getItem(STORAGE.startedAt) || 0);
  auth?.removeItem(STORAGE.state);
  auth?.removeItem(STORAGE.verifier);
  auth?.removeItem(STORAGE.startedAt);
  if (
    !expectedState ||
    !verifier ||
    returnedState !== expectedState ||
    !startedAt ||
    Date.now() - startedAt > 10 * 60 * 1000
  ) {
    return {
      handled: true,
      error: "Spotify authorization expired or could not be verified. Please try again.",
    };
  }
  if (denied) return { handled: true, error: "Spotify authorization was cancelled or denied." };
  if (!code) return { handled: true, error: "Spotify did not return an authorization code." };
  try {
    const tokenStorage = storage();
    if (!tokenStorage) return { handled: true, error: "Spotify token storage is unavailable." };
    const token = await requestToken(
      new URLSearchParams({
        client_id: configuredClientId(),
        grant_type: "authorization_code",
        code,
        redirect_uri: configuredRedirectUri(),
        code_verifier: verifier,
      }),
    );
    tokenStorage.setItem(STORAGE.access, token.access_token);
    tokenStorage.setItem(STORAGE.expires, String(Date.now() + token.expires_in * 1000));
    if (token.refresh_token) tokenStorage.setItem(STORAGE.refresh, token.refresh_token);
    emitChange();
    return { handled: true };
  } catch (error) {
    clearToken();
    return {
      handled: true,
      error: error instanceof Error ? error.message : "Spotify authorization failed.",
    };
  }
}

export async function listenForSpotifyCallbacks(
  onResult: (result: SpotifyOAuthCallbackResult) => void,
) {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") {
    return () => undefined;
  }
  let active = true;
  let lastCallbackUrl = "";
  const processCallback = async (value: string) => {
    if (!isSpotifyCallbackUrl(value) || value === lastCallbackUrl) return;
    lastCallbackUrl = value;
    await Browser.close().catch(() => undefined);
    const result = await handleSpotifyCallback(value);
    if (active && result.handled) onResult(result);
  };
  const listener = await App.addListener("appUrlOpen", ({ url }) => {
    void processCallback(url);
  });
  try {
    const launch = await App.getLaunchUrl();
    if (launch?.url) void processCallback(launch.url);
  } catch {
    // The appUrlOpen listener handles the normal resume path.
  }
  return () => {
    active = false;
    void listener.remove();
  };
}

export async function getSpotifyConnection(): Promise<SpotifyConnection> {
  const configured = spotifyIsConfigured();
  if (!configured) return { configured: false, connected: false, scopes: [...SPOTIFY_SCOPES] };
  if (!spotifyIsConnected())
    return { configured: true, connected: false, scopes: [...SPOTIFY_SCOPES] };
  try {
    const profile = await api<SpotifyProfile>("/me");
    if (!profile) return { configured: true, connected: false, scopes: [...SPOTIFY_SCOPES] };
    return {
      configured: true,
      connected: true,
      account: profile.email || profile.id,
      scopes: [...SPOTIFY_SCOPES],
      expiresAt: Number(storage()?.getItem(STORAGE.expires) || 0),
      ...(profile.display_name ? { displayName: profile.display_name } : {}),
      ...(profile.product ? { product: profile.product } : {}),
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes("authorization expired")) clearToken();
    throw error;
  }
}

export function disconnectSpotify() {
  clearToken();
}

async function currentState() {
  const player = await api<SpotifyPlayer>("/me/player");
  return player ? mapPlayer(player) : undefined;
}

async function waitForCurrentState() {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const state = await currentState();
    if (state) return state;
    if (attempt < 4) {
      await new Promise((resolve) => window.setTimeout(resolve, 250 * (attempt + 1)));
    }
  }
  return undefined;
}

async function controlSpotify(
  action: MusicAction,
  value?: number | string | boolean,
): Promise<MusicState> {
  const current = await currentState();
  if (!current && action !== "play" && action !== "resume")
    throw new Error("Spotify has no active playback device or currently playing track.");
  if (action === "toggle") {
    await api(current!.isPlaying ? "/me/player/pause" : "/me/player/play", { method: "PUT" });
  } else if (action === "play" || action === "resume") {
    await api("/me/player/play", { method: "PUT" });
  } else if (action === "pause") {
    await api("/me/player/pause", { method: "PUT" });
  } else if (action === "next") {
    await api("/me/player/next", { method: "POST" });
  } else if (action === "previous") {
    await api("/me/player/previous", { method: "POST" });
  } else if (action === "shuffle") {
    const shuffle = typeof value === "boolean" ? value : !current!.shuffle;
    await api(`/me/player/shuffle?state=${shuffle}`, { method: "PUT" });
  } else if (action === "repeat") {
    const repeat = typeof value === "boolean" ? value : !current!.repeat;
    await api(`/me/player/repeat?state=${repeat ? "context" : "off"}`, { method: "PUT" });
  } else if (action === "seek") {
    await api(`/me/player/seek?position_ms=${Math.max(0, Math.round(Number(value) || 0))}`, {
      method: "PUT",
    });
  } else if (action === "select" && value) {
    await api("/me/player/play", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        uris: [String(value).startsWith("spotify:") ? value : `spotify:track:${value}`],
      }),
    });
  }
  const next = await waitForCurrentState();
  if (!next) throw new Error("Spotify accepted the command but returned no playback state.");
  return next;
}

const spotifyAdapter: LumoMusicAdapter = {
  async play(query) {
    const result = await api<{ tracks?: { items?: Array<{ id: string; uri: string }> } }>(
      `/search?q=${encodeURIComponent(query)}&type=track&limit=1`,
    );
    const item = result?.tracks?.items?.[0];
    if (!item) throw new Error(`Spotify could not find “${query}”.`);
    await api("/me/player/play", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uris: [item.uri] }),
    });
    const state = await waitForCurrentState();
    if (!state)
      throw new Error("Spotify accepted the track but no active playback device was available.");
    return state;
  },
  control: controlSpotify,
  subscribe(listener) {
    if (!spotifyIsConnected()) return () => undefined;
    let active = true;
    const poll = async () => {
      try {
        const state = await currentState();
        if (active && state) listener(state);
      } catch {
        // The card surfaces command errors; background polling stays quiet.
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 5000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  },
};

export function getSpotifyMusicAdapter(): LumoMusicAdapter | undefined {
  return spotifyIsConfigured() && spotifyIsConnected() ? spotifyAdapter : undefined;
}

export function getMusicAdapter(): LumoMusicAdapter | undefined {
  const injected = getIntegrations().music;
  return injected ?? getSpotifyMusicAdapter();
}
