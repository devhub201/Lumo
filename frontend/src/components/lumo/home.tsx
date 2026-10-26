import { Link } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowUpRight,
  AudioLines,
  Camera,
  FileText,
  Globe,
  MessageSquare,
  Plus,
  Sparkles,
} from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Orb } from "./orb";
import { Composer, Status } from "./ui";
import { usePreferences } from "./preferences";
import { CompactAgentBrowserPanel } from "./browser-workspace";
import { MusicEmbed } from "./music-embed";
export function HomeScreen() {
  const { preferences } = usePreferences();
  const navigate = useNavigate();
  const openChat = (prompt: string) => navigate({ to: "/chat", search: { prompt } });
  return (
    <div className="home-layout">
      <section className="home-primary">
        <div className="workspace-heading">
          <div>
            <span className="eyebrow">Your space to think</span>
            <h1>Good to see you{preferences.name ? `, ${preferences.name}` : ""}.</h1>
            <p>A clear mind. A little curiosity. Endless possibility.</p>
          </div>
          <span className="workspace-date">Personal AI workspace</span>
        </div>
        <div className="core-stage">
          <div className="core-coordinate coordinate-left">
            <span>Personal intelligence</span>
            <span className="coordinate-line" />
          </div>
          <Orb />
          <div className="core-coordinate coordinate-right">
            <span className="coordinate-line" />
            <span>One thought at a time</span>
          </div>
          <div className="core-caption">
            <span className="core-caption-mark" /> LUMO
            <span className="caption-divider" />
            Your thinking companion
          </div>
        </div>
        <div className="home-interaction">
          <div className="interaction-intro">
            <Sparkles size={14} />
            <span>Where shall we begin?</span>
          </div>
          <CompactAgentBrowserPanel />
          <Composer onSend={(text) => openChat(text)} />
          <div className="suggestion-row">
            {["Plan my day", "Explore a topic", "Review my code"].map((prompt) => (
              <Button key={prompt} variant="outline" size="sm" onClick={() => openChat(prompt)}>
                {prompt}
                <ArrowUpRight />
              </Button>
            ))}
          </div>
        </div>
      </section>
      <aside className="context-panel">
        <div className="context-section">
          <div className="section-heading">
            <h2>Quick access</h2>
            <span className="metadata">01—04</span>
          </div>
          <div className="quick-grid">
            <Link to="/voice">
              <AudioLines />
              <span>Voice mode</span>
              <ArrowUpRight />
            </Link>
            <Link to="/vision">
              <Camera />
              <span>Vision</span>
              <ArrowUpRight />
            </Link>
            <Link to="/workspaces/browser">
              <Globe />
              <span>Browser</span>
              <ArrowUpRight />
            </Link>
            <Link to="/workspaces/files">
              <FileText />
              <span>Files</span>
              <ArrowUpRight />
            </Link>
          </div>
        </div>
        <div className="context-section recent-section">
          <div className="section-heading">
            <h2>Conversations</h2>
            <Button asChild variant="ghost" size="icon" title="New conversation">
              <Link to="/chat" search={{ prompt: "" }} aria-label="New conversation">
                <Plus />
              </Link>
            </Button>
          </div>
          <div className="empty-conversations">
            <MessageSquare />
            <h3>A fresh perspective.</h3>
            <p>
              Your conversations will find
              <br />a home here.
            </p>
            <Button asChild variant="link" size="sm">
              <Link to="/chat" search={{ prompt: "" }}>
                Start a conversation <ArrowUpRight />
              </Link>
            </Button>
          </div>
        </div>
        <div className="context-section workspace-context">
          <div className="section-heading">
            <h2>Your workspace</h2>
            <span className="small-spark">
              <Sparkles size={14} />
            </span>
          </div>
          <div className="context-status-row">
            <span>Environment</span>
            <span>Local preview</span>
          </div>
          <div className="context-status-row">
            <span>AI provider</span>
            <Status warning>Not connected</Status>
          </div>
          <div className="context-status-row">
            <span>Memory</span>
            <span>Not configured</span>
          </div>
          <div className="context-rule" />
          <p className="privacy-caption">
            A space that’s yours.
            <br />
            No messages sent to an AI provider.
          </p>
          <Link to="/settings" className="text-link">
            Workspace preferences <ArrowUpRight size={13} />
          </Link>
        </div>
        <div className="home-music-context">
          <div className="section-heading">
            <h2>Music</h2>
            <span className="metadata">Spotify</span>
          </div>
          <MusicEmbed query="Current Spotify playback" />
        </div>
        <div className="context-bottom">
          <span className="lumo-mini">
            <span />L
          </span>
          <span>
            Less noise.
            <br />
            <strong>More possibility.</strong>
          </span>
          <ArrowDown size={15} />
        </div>
      </aside>
    </div>
  );
}
