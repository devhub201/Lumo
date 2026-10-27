import {
  Check,
  ChevronRight,
  Eye,
  Fingerprint,
  Mic,
  Camera,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  UserRound,
  Plug,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { usePreferences } from "./preferences";
import { PageHeading } from "./ui";
import { AccountSection } from "./account";
import { IntegrationsPanel } from "./integrations-panel";
import { SpotifyConnect } from "./spotify-connect";
import { LocalAiSettings } from "./local-ai-settings";
import { isOnDeviceAiNative } from "@/lib/lumo/local-ai";
export function SettingsScreen() {
  const { preferences, update } = usePreferences();
  const onDeviceAi = isOnDeviceAiNative();
  return (
    <div className="screen-page settings-page">
      <PageHeading
        eyebrow="Make it your own"
        title="Workspace preferences"
        description="Fine-tune your space. Keep what matters."
      />
      <div className="settings-layout">
        <div className="settings-main">
          {onDeviceAi && <LocalAiSettings />}
          <section className="settings-section">
            <div className="settings-section-title">
              <SlidersHorizontal />
              <h2>Personal workspace</h2>
            </div>
            <label className="setting-row">
              <span>
                <strong>What should LUMO call you?</strong>
                <small>Optional. Used only for your local greeting.</small>
              </span>
              <input
                aria-label="Preferred name"
                maxLength={30}
                className="text-input name-input"
                placeholder="Your name"
                value={preferences.name}
                onChange={(e) => update({ name: e.target.value })}
              />
            </label>
            <div className="setting-row">
              <span>
                <strong>Appearance</strong>
                <small>Choose the atmosphere of your workspace.</small>
              </span>
              <div className="segmented" aria-label="Appearance">
                {(["midnight", "graphite"] as const).map((value) => (
                  <Button
                    key={value}
                    variant="ghost"
                    aria-pressed={preferences.appearance === value}
                    onClick={() => update({ appearance: value })}
                  >
                    {value === "midnight" ? "Midnight" : "Graphite"}
                  </Button>
                ))}
              </div>
            </div>
            <div className="setting-row">
              <span>
                <strong>Accent color</strong>
                <small>A subtle signature, throughout LUMO.</small>
              </span>
              <div className="color-choices">
                <Button
                  variant="ghost"
                  className="swatch swatch-cyan"
                  aria-label="Cyan accent"
                  title="Cyan"
                  aria-pressed={preferences.accent === "cyan"}
                  onClick={() => update({ accent: "cyan" })}
                >
                  {preferences.accent === "cyan" && <Check />}
                </Button>
                <Button
                  variant="ghost"
                  className="swatch swatch-blue"
                  aria-label="Blue accent"
                  title="Electric blue"
                  aria-pressed={preferences.accent === "blue"}
                  onClick={() => update({ accent: "blue" })}
                >
                  {preferences.accent === "blue" && <Check />}
                </Button>
              </div>
            </div>
          </section>
          <section className="settings-section">
            <div className="settings-section-title">
              <Eye />
              <h2>Motion & accessibility</h2>
            </div>
            <label className="setting-row">
              <span>
                <strong>Orb animation</strong>
                <small>Gentle energy circulation. Respects reduced-motion settings.</small>
              </span>
              <Switch
                checked={preferences.motion}
                onCheckedChange={(value) => update({ motion: value })}
                aria-label="Orb animation"
              />
            </label>
            <label className="setting-row">
              <span>
                <strong>Higher contrast</strong>
                <small>Increase contrast for borders and secondary text.</small>
              </span>
              <Switch
                checked={preferences.contrast}
                onCheckedChange={(value) => update({ contrast: value })}
                aria-label="Higher contrast"
              />
            </label>
            <label className="setting-row">
              <span>
                <strong>Larger text</strong>
                <small>More comfortable reading across your workspace.</small>
              </span>
              <Switch
                checked={preferences.largeText}
                onCheckedChange={(value) => update({ largeText: value })}
                aria-label="Larger text"
              />
            </label>
          </section>
          {!onDeviceAi && (
            <section className="settings-section">
              <div className="settings-section-title">
                <UserRound />
                <h2>Account</h2>
              </div>
              <AccountSection />
            </section>
          )}
          <section className="settings-section">
            <div className="settings-section-title">
              <Mic />
              <h2>Voice & interaction</h2>
            </div>
            <div className="setting-row">
              <span>
                <strong>Speech recognition & voice replies</strong>
                <small>
                  Not connected. Voice mode measures your microphone level locally; no speech is
                  transcribed or spoken.
                </small>
              </span>
              <span className="preview-chip">Unavailable</span>
            </div>
            <div className="setting-row">
              <span>
                <strong>Sending messages</strong>
                <small>
                  Enter adds a new line on desktop; use the send button. On touch devices Enter
                  sends.
                </small>
              </span>
              <span className="preview-chip">Built in</span>
            </div>
          </section>
          <section className="settings-section">
            <div className="settings-section-title">
              <Plug />
              <h2>Connected integrations</h2>
            </div>
            {onDeviceAi && (
              <p className="metadata">
                Spotify uses the internet for playback. Your LUMO AI prompts still stay on this
                phone.
              </p>
            )}
            {!onDeviceAi && <IntegrationsPanel />}
            <SpotifyConnect />
          </section>
          <section className="settings-section">
            <div className="settings-section-title">
              <ShieldCheck />
              <h2>Permissions & privacy</h2>
            </div>
            <div className="permission-row">
              <Mic />
              <div>
                <strong>Microphone</strong>
                <p>
                  Requested only when you start voice mode. Audio levels are measured locally; no
                  recording or speech processing is connected.
                </p>
              </div>
              <Link to="/voice" aria-label="Open voice mode">
                <ChevronRight />
              </Link>
            </div>
            <div className="permission-row">
              <Camera />
              <div>
                <strong>Camera</strong>
                <p>
                  Requested only when you enable the camera. Captures remain in this visit unless
                  you choose to save or send them to a connected provider.
                </p>
              </div>
              <Link to="/vision" aria-label="Open camera">
                <ChevronRight />
              </Link>
            </div>
            {!onDeviceAi && (
              <div className="permission-row">
                <Fingerprint />
                <div>
                  <strong>Identity verification</strong>
                  <p>
                    No biometric provider is connected. No secure identity or account session is
                    created by this preview.
                  </p>
                </div>
                <Link to="/auth" aria-label="Open identity verification">
                  <ChevronRight />
                </Link>
              </div>
            )}
          </section>
        </div>
        <aside className="settings-about">
          <div className="about-symbol">
            <Sparkles />
          </div>
          <h2>A space that’s yours.</h2>
          <p>Personal preferences are saved on this device when browser storage is available.</p>
          <dl>
            <div>
              <dt>Application</dt>
              <dd>LUMO</dd>
            </div>
            <div>
              <dt>Version</dt>
              <dd>{onDeviceAi ? "0.2 · On-device AI" : "0.1 · Frontend preview"}</dd>
            </div>
            <div>
              <dt>AI provider</dt>
              <dd>{onDeviceAi ? "LiteRT-LM · local" : "Not connected"}</dd>
            </div>
            <div>
              <dt>Native bridge</dt>
              <dd>{onDeviceAi ? "LiteRT-LM" : "Not connected"}</dd>
            </div>
            <div>
              <dt>Storage</dt>
              <dd>
                {onDeviceAi ? "Chats and model on this device" : "Preferences on this device"}
              </dd>
            </div>
          </dl>
          <span className="metadata">Built for thoughtful interaction.</span>
        </aside>
      </div>
    </div>
  );
}
