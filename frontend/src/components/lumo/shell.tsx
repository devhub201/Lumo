import { Link, useRouterState } from "@tanstack/react-router";
import {
  Aperture,
  CircleHelp,
  Command,
  Home,
  LayoutGrid,
  ShieldCheck,
  Settings2,
  Sparkles,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { PreferencesProvider, usePreferences } from "./preferences";
import { isOnDeviceAiNative } from "@/lib/lumo/local-ai";

const workspacePaths = ["/workspaces", "/voice", "/vision", "/tools"];
const navigation = [
  { to: "/", label: "Home", icon: Home, match: (p: string) => p === "/" || p.startsWith("/chat") },
  {
    to: "/workspaces",
    label: "Workspaces",
    icon: LayoutGrid,
    match: (p: string) => workspacePaths.some((w) => p.startsWith(w)),
  },
  {
    to: "/settings",
    label: "Settings",
    icon: Settings2,
    match: (p: string) => p.startsWith("/settings"),
  },
] as const;
const titles: Array<[string, string]> = [
  ["/chat", "Conversations"],
  ["/workspaces/code", "Coding"],
  ["/workspaces/browser", "Browser"],
  ["/workspaces/files", "Files"],
  ["/workspaces/study", "Study"],
  ["/workspaces", "Workspaces"],
  ["/voice", "Voice"],
  ["/vision", "Vision"],
  ["/tools", "Toolkit"],
  ["/settings", "Settings"],
  ["/auth", "Identity"],
];

function InnerShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { preferences } = usePreferences();
  const [help, setHelp] = useState(false);
  const onDeviceAi = isOnDeviceAiNative();
  const label =
    pathname === "/" ? "Home" : (titles.find(([p]) => pathname.startsWith(p))?.[1] ?? "LUMO");
  return (
    <div className="app-shell">
      <aside className="nav-rail">
        <Link to="/" className="rail-brand" aria-label="LUMO home">
          <Aperture />
        </Link>
        <div className="rail-divider" />
        <nav aria-label="Main navigation" className="nav-primary">
          {navigation.map(({ to, label, icon: Icon, match }) => (
            <Link
              key={to}
              to={to}
              title={label}
              aria-label={label}
              aria-current={match(pathname) ? "page" : undefined}
              className={`rail-link ${match(pathname) ? "active" : ""}`}
            >
              <Icon />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="rail-bottom">
          <Button
            size="icon"
            variant="ghost"
            title="About this preview"
            aria-label="About this preview"
            onClick={() => setHelp(!help)}
          >
            <CircleHelp />
          </Button>
          <div
            className="profile-avatar"
            title={onDeviceAi ? "LUMO runs on this phone" : "Private access via Tailscale"}
            aria-label={onDeviceAi ? "LUMO runs on this phone" : "Private access via Tailscale"}
          >
            <ShieldCheck />
          </div>
        </div>
      </aside>
      <div className="shell-main">
        <header className="topbar">
          <div className="breadcrumb">
            <span className="wordmark">
              LUMO
              <span className="brand-point" />
            </span>
            <span className="breadcrumb-divider">/</span>
            <span>{label}</span>
          </div>
          <div className="topbar-right">
            <span className="preview-label">
              {onDeviceAi ? <>Private local workspace <span>This phone</span></> : <>Private workspace <span>Tailscale</span></>}
            </span>
            <Button asChild variant="ghost" className="workspace-selector">
              <Link to="/settings">
                <span className="workspace-dot" />
                {preferences.name || "Personal"}
              </Link>
            </Button>
          </div>
        </header>
        <main>{children}</main>
        <footer className="system-footer">
          <span>
            <span className="footer-dot" /> {onDeviceAi ? "On-device AI" : "Private tailnet"}
          </span>
          <span>
            <span>LUMO <span className="footer-version">{onDeviceAi ? "v0.2" : "v0.1"}</span>
            <span className="footer-divider">/</span>{onDeviceAi ? "Private · no account" : "Connected securely"}</span>
          </span>
          <span className="footer-end">
            <Command size={12} /> Designed for focus
          </span>
        </footer>
      </div>
      {help && (
        <div className="help-popover" role="dialog" aria-label={onDeviceAi ? "About LUMO" : "About this preview"}>
          <Sparkles size={20} />
          <h3>{onDeviceAi ? "Your private local assistant." : "A workspace in the making."}</h3>
          <p>
            {onDeviceAi
              ? "Download the model once in Settings. Afterwards, LUMO can answer on this phone without internet, a sign-in, a VPS, or an OpenAI key. The small local model can make mistakes and does not browse the web."
              : "Camera, microphone, local files, the browser view, and preferences work in supported browsers. AI, terminal execution, speech processing, accounts, and integrations require a connected provider."}
          </p>
          <Button variant="outline" onClick={() => setHelp(false)}>
            Got it
          </Button>
        </div>
      )}
    </div>
  );
}
export function Shell({ children }: { children: ReactNode }) {
  return (
    <PreferencesProvider>
      <InnerShell>{children}</InnerShell>
    </PreferencesProvider>
  );
}
