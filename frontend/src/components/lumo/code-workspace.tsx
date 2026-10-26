import { useEffect, useRef, useState } from "react";
import {
  Download,
  FileCode2,
  FolderOpen,
  GitBranch,
  Hammer,
  Lock,
  PanelLeft,
  Play,
  Square,
  TerminalSquare,
  TestTube2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getWorkspaceIntegrations,
  type GitStatus,
  type TerminalResult,
} from "@/lib/lumo/integrations";
import { EmptyState, WorkspaceHeader } from "./workspaces";
import { Status } from "./ui";

interface ProjectFile {
  path: string;
  content: string;
  original: string;
  binary: boolean;
}
interface Run {
  id: string;
  command: string;
  running: boolean;
  result?: TerminalResult | undefined;
  error?: string | undefined;
}
const TEXT =
  /\.(txt|md|json|ts|tsx|js|jsx|mjs|cjs|py|html|css|scss|yml|yaml|toml|sh|env\.example|gitignore|rs|go|java|kt|c|cpp|h|sql|xml|svg)$/i;
const SKIP = /(^|\/)(node_modules|\.git|dist|build|\.next)\//;

export function CodeWorkspace() {
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [project, setProject] = useState("");
  const [tabs, setTabs] = useState<string[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [panel, setPanel] = useState<"terminal" | "problems" | "git">("terminal");
  const [explorer, setExplorer] = useState(false);
  const [runs, setRuns] = useState<Run[]>([]);
  const [command, setCommand] = useState("");
  const [git, setGit] = useState<{
    loading: boolean;
    status?: GitStatus | undefined;
    error?: string | undefined;
  }>({ loading: false });
  const [loadingProject, setLoadingProject] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);
  const { terminal, git: gitAdapter } = getWorkspaceIntegrations();
  const [hasTerminal, setHasTerminal] = useState(false);
  const [hasGit, setHasGit] = useState(false);
  useEffect(() => {
    setHasTerminal(!!terminal);
    setHasGit(!!gitAdapter);
    return () => abort.current?.abort();
  }, [terminal, gitAdapter]);
  useEffect(() => {
    picker.current?.setAttribute("webkitdirectory", "");
  }, []);

  const loadGit = async () => {
    if (!gitAdapter) return;
    const c = new AbortController();
    setGit({ loading: true });
    try {
      setGit({ loading: false, status: await gitAdapter.status(c.signal) });
    } catch (e) {
      setGit({ loading: false, error: e instanceof Error ? e.message : "Git status failed." });
    }
  };
  useEffect(() => {
    if (panel === "git" && hasGit && !git.status && !git.loading) void loadGit();
  }, [panel, hasGit]); // eslint-disable-line react-hooks/exhaustive-deps

  const openProject = async (list: FileList) => {
    setLoadingProject(true);
    const entries = Array.from(list)
      .filter((f) => !SKIP.test(f.webkitRelativePath || f.name))
      .slice(0, 400);
    const loaded = await Promise.all(
      entries.map(async (f) => {
        const path = f.webkitRelativePath || f.name;
        const binary = !TEXT.test(path) || f.size > 1024 * 1024;
        const content = binary ? "" : await f.text().catch(() => "");
        return { path, content, original: content, binary };
      }),
    );
    loaded.sort((a, b) => a.path.localeCompare(b.path));
    setProject(entries[0]?.webkitRelativePath.split("/")[0] || "Local files");
    setFiles(loaded);
    const first = loaded.find((f) => !f.binary);
    setTabs(first ? [first.path] : []);
    setActive(first?.path ?? null);
    setLoadingProject(false);
  };
  const open = (path: string) => {
    setTabs((t) => (t.includes(path) ? t : [...t, path]));
    setActive(path);
    setExplorer(false);
  };
  const close = (path: string) => {
    const next = tabs.filter((t) => t !== path);
    setTabs(next);
    if (active === path) setActive(next.at(-1) ?? null);
  };
  const current = files.find((f) => f.path === active);
  const edit = (content: string) =>
    setFiles((fs) => fs.map((f) => (f.path === active ? { ...f, content } : f)));
  const download = () => {
    if (!current) return;
    const url = URL.createObjectURL(new Blob([current.content]));
    const a = document.createElement("a");
    a.href = url;
    a.download = current.path.split("/").pop() ?? "file.txt";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setFiles((fs) => fs.map((f) => (f.path === current.path ? { ...f, original: f.content } : f)));
  };

  const run = async (cmd: string) => {
    if (!terminal || !cmd.trim()) return;
    abort.current?.abort();
    const c = new AbortController();
    abort.current = c;
    const id = crypto.randomUUID();
    setPanel("terminal");
    setRuns((r) => [...r, { id, command: cmd, running: true }]);
    setCommand("");
    try {
      const result = await terminal.run(cmd, c.signal);
      setRuns((r) => r.map((x) => (x.id === id ? { ...x, running: false, result } : x)));
    } catch (e) {
      setRuns((r) =>
        r.map((x) =>
          x.id === id
            ? {
                ...x,
                running: false,
                error: c.signal.aborted
                  ? "Stopped by you."
                  : e instanceof Error
                    ? e.message
                    : "Command failed to start.",
              }
            : x,
        ),
      );
    }
  };
  const running = runs.some((r) => r.running);
  const problems = runs.filter((r) => r.error || (r.result && r.result.exitCode !== 0));

  return (
    <div className="ws-page code-ws">
      <WorkspaceHeader eyebrow={project || "No project"} title="Coding">
        <Status warning={!hasTerminal}>
          {hasTerminal ? "Execution connected" : "Execution unavailable"}
        </Status>
        <Button
          size="sm"
          variant="ghost"
          disabled={!hasTerminal || running}
          onClick={() => void run("npm run dev")}
          title={hasTerminal ? "Run" : "Requires a connected execution backend"}
        >
          <Play />
          Run
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={!hasTerminal || running}
          onClick={() => void run("npm test")}
        >
          <TestTube2 />
          Test
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={!hasTerminal || running}
          onClick={() => void run("npm run build")}
        >
          <Hammer />
          Build
        </Button>
      </WorkspaceHeader>
      <input
        ref={picker}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) void openProject(e.target.files);
          e.target.value = "";
        }}
      />
      {loadingProject ? (
        <div className="code-grid" role="status" aria-label="Opening project">
          <div className="p-4 grid gap-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-3 w-4/5" />
            ))}
          </div>
          <div className="p-4 grid gap-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-3 w-full" />
            ))}
          </div>
        </div>
      ) : !files.length ? (
        <EmptyState
          icon={<FolderOpen />}
          title="No project open"
          action={
            <Button onClick={() => picker.current?.click()}>
              <FolderOpen />
              Open a folder
            </Button>
          }
        >
          Open a folder from your device to browse and edit files here. Edits stay in this visit —
          download a file to keep changes. Running commands needs a connected execution backend.
        </EmptyState>
      ) : (
        <div className={`code-grid ${explorer ? "explorer-open" : ""}`}>
          <aside className="code-explorer" aria-label="Project files">
            <div className="section-heading">
              <h2>{project}</h2>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Open another folder"
                title="Open another folder"
                onClick={() => picker.current?.click()}
              >
                <FolderOpen />
              </Button>
            </div>
            <ul>
              {files.map((f) => (
                <li key={f.path}>
                  <button
                    type="button"
                    disabled={f.binary}
                    className={f.path === active ? "active" : ""}
                    style={{ paddingLeft: 8 + (f.path.split("/").length - 2) * 10 }}
                    onClick={() => open(f.path)}
                    title={f.binary ? "Binary or large file — not editable" : f.path}
                  >
                    <FileCode2 size={13} />
                    <span>{f.path.split("/").pop()}</span>
                    {f.content !== f.original && <i aria-label="Unsaved" className="dirty-dot" />}
                  </button>
                </li>
              ))}
            </ul>
          </aside>
          <section className="code-editor">
            <div className="code-tabs" role="tablist">
              <Button
                variant="ghost"
                size="icon-sm"
                className="explorer-toggle"
                aria-label="Toggle file explorer"
                onClick={() => setExplorer((v) => !v)}
              >
                <PanelLeft />
              </Button>
              {tabs.map((t) => (
                <div
                  key={t}
                  role="tab"
                  aria-selected={t === active}
                  className={`code-tab ${t === active ? "active" : ""}`}
                >
                  <button type="button" onClick={() => setActive(t)}>
                    {t.split("/").pop()}
                    {files.find((f) => f.path === t && f.content !== f.original) ? " •" : ""}
                  </button>
                  <button type="button" aria-label={`Close ${t}`} onClick={() => close(t)}>
                    <X size={12} />
                  </button>
                </div>
              ))}
              {current && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="ml-auto"
                  aria-label="Download file"
                  title="Download this file"
                  onClick={download}
                >
                  <Download />
                </Button>
              )}
            </div>
            {current ? (
              <div className="code-area">
                <pre aria-hidden className="code-gutter">
                  {current.content
                    .split("\n")
                    .map((_, i) => i + 1)
                    .join("\n")}
                </pre>
                <textarea
                  aria-label={`Editing ${current.path}`}
                  spellCheck={false}
                  value={current.content}
                  onChange={(e) => edit(e.target.value)}
                  onScroll={(e) => {
                    const g = e.currentTarget.previousElementSibling as HTMLElement;
                    g.scrollTop = e.currentTarget.scrollTop;
                  }}
                />
              </div>
            ) : (
              <EmptyState icon={<FileCode2 />} title="No file open">
                Choose a file from the explorer.
              </EmptyState>
            )}
          </section>
          <section className="code-panel">
            <div className="code-panel-tabs">
              {(["terminal", "problems", "git"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  aria-pressed={panel === p}
                  onClick={() => setPanel(p)}
                >
                  {p === "terminal" ? (
                    <TerminalSquare size={13} />
                  ) : p === "git" ? (
                    <GitBranch size={13} />
                  ) : null}
                  {p === "problems"
                    ? `Problems ${problems.length || ""}`
                    : p[0]!.toUpperCase() + p.slice(1)}
                </button>
              ))}
              {running && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto"
                  onClick={() => abort.current?.abort()}
                >
                  <Square />
                  Stop
                </Button>
              )}
            </div>
            {panel === "terminal" &&
              (!hasTerminal ? (
                <div className="terminal-unavailable">
                  <Lock size={14} />
                  <div>
                    <strong>Terminal unavailable</strong>
                    <p>
                      No execution backend is connected, so commands can't run. LUMO never shows
                      simulated output.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="terminal" aria-live="polite">
                  {runs.map((r) => (
                    <div key={r.id} className="terminal-run">
                      <div className="terminal-cmd">$ {r.command}</div>
                      {r.running && <div className="terminal-meta">Running…</div>}
                      {r.result && (
                        <>
                          <pre>{r.result.stdout}</pre>
                          {r.result.stderr && <pre className="terminal-err">{r.result.stderr}</pre>}
                          <div
                            className={`terminal-meta ${r.result.exitCode ? "is-fail" : "is-ok"}`}
                          >
                            exit {r.result.exitCode} · {(r.result.durationMs / 1000).toFixed(1)}s
                          </div>
                        </>
                      )}
                      {r.error && <div className="terminal-meta is-fail">{r.error}</div>}
                    </div>
                  ))}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void run(command);
                    }}
                    className="terminal-input"
                  >
                    <span>$</span>
                    <input
                      aria-label="Terminal command"
                      value={command}
                      disabled={running}
                      onChange={(e) => setCommand(e.target.value)}
                      placeholder="Type a command"
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </form>
                </div>
              ))}
            {panel === "problems" &&
              (problems.length ? (
                <div className="terminal">
                  {problems.map((r) => (
                    <div key={r.id} className="terminal-run">
                      <div className="terminal-cmd is-fail">{r.command}</div>
                      <pre className="terminal-err">
                        {r.error ?? r.result?.stderr ?? `Exited with code ${r.result?.exitCode}`}
                      </pre>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="code-panel-empty">No problems reported by runs in this visit.</p>
              ))}
            {panel === "git" &&
              (!hasGit ? (
                <p className="code-panel-empty">
                  Git status unavailable — no repository backend is connected.
                </p>
              ) : git.loading ? (
                <div className="p-3 grid gap-2">
                  <Skeleton className="h-3 w-1/3" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              ) : git.error ? (
                <p className="code-panel-empty">
                  {git.error}{" "}
                  <Button variant="link" size="sm" onClick={() => void loadGit()}>
                    Retry
                  </Button>
                </p>
              ) : (
                git.status && (
                  <div className="terminal">
                    <div className="terminal-cmd">
                      <GitBranch size={12} /> {git.status.branch} · ↑{git.status.ahead} ↓
                      {git.status.behind}
                    </div>
                    {git.status.changes.length ? (
                      git.status.changes.map((c) => (
                        <div key={c.path} className="terminal-meta">
                          {c.status} {c.path}
                        </div>
                      ))
                    ) : (
                      <div className="terminal-meta">Working tree clean</div>
                    )}
                  </div>
                )
              ))}
          </section>
        </div>
      )}
    </div>
  );
}
