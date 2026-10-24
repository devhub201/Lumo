import { useEffect, useState } from "react";
import { Music2, Pause, Play, Repeat, Shuffle, SkipBack, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { type MusicAction, type MusicState } from "@/lib/lumo/integrations";
import { getMusicAdapter } from "@/lib/lumo/spotify";

const time = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

/** Live player card. Shows real adapter state only; without an adapter it is an honest unavailable card. */
export function MusicEmbed({
  query,
  initial,
}: {
  query: string;
  initial?: MusicState | undefined;
}) {
  const [state, setState] = useState<MusicState | undefined>(initial);
  const [adapter, setAdapter] = useState(() => getMusicAdapter());
  const [position, setPosition] = useState(initial?.positionMs ?? 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const sync = () => setAdapter(getMusicAdapter());
    sync();
    window.addEventListener("lumo-spotify-updated", sync);
    return () => window.removeEventListener("lumo-spotify-updated", sync);
  }, []);
  useEffect(() => adapter?.subscribe?.((next) => setState(next)), [adapter]);
  useEffect(() => {
    if (state) setPosition(state.positionMs);
  }, [state]);
  useEffect(() => {
    if (!state?.isPlaying) return;
    const id = window.setInterval(
      () => setPosition((p) => Math.min(p + 1000, state.track.durationMs)),
      1000,
    );
    return () => window.clearInterval(id);
  }, [state]);

  const control = async (action: MusicAction, value?: number | string) => {
    if (!adapter || busy) return;
    setBusy(true);
    setError("");
    try {
      setState(await adapter.control(action, value));
    } catch (e) {
      setError(e instanceof Error ? e.message : "The player did not respond.");
    } finally {
      setBusy(false);
    }
  };

  const live = !!adapter && !!state;
  const track = state?.track;
  const duration = track?.durationMs ?? 0;
  const pct = duration ? (position / duration) * 100 : 0;

  return (
    <section className={`music-embed ${live ? "" : "is-unavailable"}`} aria-label="Music player">
      <div className="music-now">
        <div className="music-art">
          {track?.artworkUrl ? (
            <img src={track.artworkUrl} alt={`${track.title} artwork`} />
          ) : (
            <Music2 />
          )}
        </div>
        <div className="music-info">
          <span className="music-eyebrow">
            {live ? (state.isPlaying ? "Now playing" : "Paused") : "Spotify not connected"}
          </span>
          <h3 title={track?.title ?? query}>{track?.title ?? query}</h3>
          <p>{track?.artist ?? "Playback starts once Spotify is connected."}</p>
          <input
            className="music-progress"
            type="range"
            min={0}
            max={duration || 1}
            step={1000}
            value={position}
            disabled={!live || busy}
            aria-label="Seek"
            style={{ ["--pct" as string]: `${pct}%` }}
            onChange={(e) => setPosition(Number(e.target.value))}
            onPointerUp={(e) => void control("seek", Number(e.currentTarget.value))}
            onKeyUp={(e) => void control("seek", Number(e.currentTarget.value))}
          />
          <div className="music-times">
            <span>{time(position)}</span>
            <span>{live ? time(duration) : "--:--"}</span>
          </div>
        </div>
      </div>
      <div className="music-controls">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Shuffle"
          aria-pressed={!!state?.shuffle}
          className={state?.shuffle ? "is-on" : ""}
          disabled={!live || busy}
          onClick={() => void control("shuffle")}
        >
          <Shuffle />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Previous track"
          disabled={!live || busy}
          onClick={() => void control("previous")}
        >
          <SkipBack />
        </Button>
        <Button
          size="icon"
          className="music-play"
          aria-label={state?.isPlaying ? "Pause" : "Play"}
          disabled={!live || busy}
          onClick={() => void control("toggle")}
        >
          {state?.isPlaying ? <Pause /> : <Play />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Next track"
          disabled={!live || busy}
          onClick={() => void control("next")}
        >
          <SkipForward />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Repeat"
          aria-pressed={!!state?.repeat}
          className={state?.repeat ? "is-on" : ""}
          disabled={!live || busy}
          onClick={() => void control("repeat")}
        >
          <Repeat />
        </Button>
      </div>
      {error && (
        <p className="music-error" role="alert">
          {error}
        </p>
      )}
      {live && state.queue.length > 0 && (
        <div className="music-queue">
          <span className="music-eyebrow">Queue</span>
          {state.queue.slice(0, 5).map((t) => (
            <button
              key={t.id}
              type="button"
              className="music-queue-item"
              disabled={busy}
              onClick={() => void control("select", t.id)}
            >
              <Music2 />
              <strong>{t.title}</strong>
              <span>{t.artist}</span>
              <time>{time(t.durationMs)}</time>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
