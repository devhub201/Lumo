import { Link } from "@tanstack/react-router";
import {
  ArrowUpRight,
  AudioLines,
  BookOpen,
  Camera,
  Code2,
  FolderOpen,
  Globe,
  Wrench,
} from "lucide-react";
import { PageHeading } from "./ui";

const items = [
  {
    to: "/workspaces/code",
    name: "Coding",
    description: "Explorer, tabs, editor, and an integrated terminal.",
    icon: Code2,
    status: "Local editor · Terminal requires backend",
    live: true,
  },
  {
    to: "/workspaces/browser",
    name: "Browser",
    description: "Navigate the web inside your workspace.",
    icon: Globe,
    status: "Available · Some sites block embedding",
    live: true,
  },
  {
    to: "/workspaces/files",
    name: "Files & documents",
    description: "Open, preview, and organise local files.",
    icon: FolderOpen,
    status: "Local preview · Analysis not connected",
    live: true,
  },
  {
    to: "/vision",
    name: "Camera & vision",
    description: "Capture and preview with your camera.",
    icon: Camera,
    status: "Camera available · Analysis not connected",
    live: true,
  },
  {
    to: "/voice",
    name: "Voice",
    description: "Listen, speak, and see your voice level.",
    icon: AudioLines,
    status: "Microphone available · Speech not connected",
    live: true,
  },
  {
    to: "/workspaces/study",
    name: "Study",
    description: "Focus sessions and topics for this visit.",
    icon: BookOpen,
    status: "Focus timer · Planner coming later",
    live: true,
  },
  {
    to: "/tools",
    name: "Toolkit",
    description: "Calculator, JSON formatter, and quick utilities.",
    icon: Wrench,
    status: "Local utilities",
    live: true,
  },
] as const;

export function WorkspacesScreen() {
  return (
    <div className="screen-page">
      <PageHeading
        eyebrow="Dedicated environments"
        title="Workspaces"
        description="A focused place for each kind of work."
        action={<span className="preview-chip">{items.length} workspaces</span>}
      />
      <div className="tools-grid workspaces-grid">
        {items.map(({ to, name, description, icon: Icon, status }) => (
          <Link key={to} to={to} className="tool-card workspace-card">
            <div className="tool-card-top">
              <span className="tool-icon">
                <Icon />
              </span>
              <ArrowUpRight />
            </div>
            <h2>{name}</h2>
            <p>{description}</p>
            <span
              className={`tool-availability ${status.includes("not connected") || status.includes("requires") ? "" : ""}`}
            >
              <span />
              {status}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function WorkspaceHeader({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="ws-header">
      <div className="min-w-0">
        <Link to="/workspaces" className="ws-back">
          Workspaces
        </Link>
        <span className="ws-sep">/</span>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
      </div>
      <div className="ws-header-actions">{children}</div>
    </header>
  );
}

export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="ws-empty">
      <span className="tool-icon">{icon}</span>
      <h2>{title}</h2>
      <p>{children}</p>
      {action}
    </div>
  );
}
