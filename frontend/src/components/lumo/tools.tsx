import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Braces,
  Calculator,
  Check,
  Code2,
  Copy,
  FileText,
  Globe,
  Layers,
  Search,
  Smartphone,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { calculate } from "@/lib/lumo/calculator";
import { Notice, PageHeading } from "./ui";
type Tool = "search" | "calculator" | "files" | "memory" | "code" | "device";
const tools: Array<{
  id: Tool;
  name: string;
  description: string;
  icon: typeof Globe;
  status: string;
  category: string;
}> = [
  {
    id: "search",
    name: "Web search",
    description: "Follow your curiosity beyond the workspace.",
    icon: Globe,
    status: "External search",
    category: "Research",
  },
  {
    id: "calculator",
    name: "Calculator",
    description: "Quick answers. Clear numbers. No distractions.",
    icon: Calculator,
    status: "Available locally",
    category: "Everyday",
  },
  {
    id: "files",
    name: "File intelligence",
    description: "Open a document. Find a new perspective.",
    icon: FileText,
    status: "Local text preview",
    category: "Research",
  },
  {
    id: "memory",
    name: "Memory",
    description: "A thread connecting your ideas over time.",
    icon: Layers,
    status: "Requires setup",
    category: "Everyday",
  },
  {
    id: "code",
    name: "Coding tools",
    description: "A focused toolkit for structured thinking.",
    icon: Code2,
    status: "Local JSON formatter",
    category: "Development",
  },
  {
    id: "device",
    name: "Device integrations",
    description: "Connect your workspace to your world.",
    icon: Smartphone,
    status: "Not connected",
    category: "Development",
  },
];
export function ToolsScreen() {
  const [selected, setSelected] = useState<Tool | null>(null);
  const [filter, setFilter] = useState("All tools");
  const [query, setQuery] = useState("");
  const [value, setValue] = useState("");
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [copied, setCopied] = useState(false);
  const tool = tools.find((t) => t.id === selected);
  useEffect(() => {
    if (!selected) return;
    const previous = document.activeElement;
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const controls = Array.from(
        document.querySelectorAll<HTMLElement>(
          ".tool-modal button:not(:disabled), .tool-modal input, .tool-modal textarea, .tool-modal a[href]",
        ),
      );
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", trapFocus);
    return () => {
      document.removeEventListener("keydown", trapFocus);
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, [selected]);
  const open = (id: Tool) => {
    setSelected(id);
    setValue("");
    setResult("");
    setError("");
    setCopied(false);
    setFileName("");
  };
  const run = () => {
    setError("");
    try {
      if (selected === "calculator") setResult(String(calculate(value)));
      if (selected === "code") {
        const formatted = JSON.stringify(JSON.parse(value), null, 2);
        setResult(formatted);
      }
    } catch (e) {
      setResult("");
      setError(e instanceof Error ? e.message : "Please check your input.");
    }
  };
  const readFile = async (file: File) => {
    if (file.size > 2 * 1024 * 1024) {
      setError("Text files must be under 2 MB.");
      return;
    }
    if (!/\.(txt|md|json|csv|log|ts|js|py|html|css)$/i.test(file.name)) {
      setError(
        "Choose a text, Markdown, JSON, CSV, or source-code file. PDF analysis requires setup.",
      );
      return;
    }
    setLoading(true);
    setError("");
    setFileName(file.name);
    try {
      setResult(await file.text());
    } catch {
      setError("This file could not be read.");
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="screen-page">
      <PageHeading
        eyebrow="A little more capability"
        title="Your toolkit"
        description="The right tool. At the right moment."
        action={<span className="preview-chip">6 tools · 3 local utilities</span>}
      />
      <div className="tools-toolbar">
        <div className="tool-tabs">
          {["All tools", "Everyday", "Research", "Development"].map((tab) => (
            <Button
              key={tab}
              variant="ghost"
              aria-pressed={filter === tab}
              onClick={() => setFilter(tab)}
            >
              {tab}
            </Button>
          ))}
        </div>
        <div className="tool-search">
          <Search size={16} />
          <input
            aria-label="Search tools"
            placeholder="Find a tool"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>
      <div className="tools-grid">
        {tools
          .filter(
            (t) =>
              (filter === "All tools" || t.category === filter) &&
              t.name.toLowerCase().includes(query.toLowerCase()),
          )
          .map(({ id, name, description, icon: Icon, status }) => (
            <Button variant="ghost" key={id} className="tool-card" onClick={() => open(id)}>
              <div className="tool-card-top">
                <span className={`tool-icon tool-icon-${id}`}>
                  <Icon />
                </span>
                <ArrowUpRight />
              </div>
              <h2>{name}</h2>
              <p>{description}</p>
              <span
                className={`tool-availability ${status.includes("setup") || status.includes("connected") ? "unavailable" : ""}`}
              >
                <span />
                {status}
              </span>
            </Button>
          ))}
      </div>
      {!tools.some(
        (t) =>
          (filter === "All tools" || t.category === filter) &&
          t.name.toLowerCase().includes(query.toLowerCase()),
      ) && <Notice>No tools match “{query}”.</Notice>}
      <div className="tools-footnote">
        <Braces size={16} />
        <span>
          Purpose-built utilities. Clear boundaries. Only connected tools process your data.
        </span>
      </div>
      {tool && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget && !loading) setSelected(null);
          }}
        >
          <section
            className="tool-modal"
            role="dialog"
            aria-modal="true"
            aria-label={tool.name}
            onKeyDown={(e) => {
              if (e.key === "Escape" && !loading) setSelected(null);
            }}
          >
            <div className="section-heading">
              <h2>
                <tool.icon size={20} />
                {tool.name}
              </h2>
              <Button
                variant="ghost"
                size="icon"
                disabled={loading}
                autoFocus
                title="Close tool"
                aria-label="Close tool"
                onClick={() => setSelected(null)}
              >
                <X />
              </Button>
            </div>
            <p className="tool-modal-description">{tool.description}</p>
            {selected === "search" ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!value.trim()) {
                    setError("Enter a search query.");
                    return;
                  }
                  window.open(
                    `https://www.google.com/search?q=${encodeURIComponent(value)}`,
                    "_blank",
                    "noopener,noreferrer",
                  );
                }}
              >
                <label className="input-label" htmlFor="web-query">
                  Search the web
                </label>
                <input
                  id="web-query"
                  className="text-input"
                  required
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="What are you curious about?"
                />
                <Button type="submit">
                  <Globe />
                  Open Google search
                  <ArrowUpRight />
                </Button>
                <p className="privacy-caption">
                  Opens an external search in a new tab. Integrated AI web research is not
                  connected.
                </p>
              </form>
            ) : selected === "calculator" || selected === "code" ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  run();
                }}
              >
                <label className="input-label" htmlFor="tool-value">
                  {selected === "calculator" ? "Arithmetic expression" : "JSON input"}
                </label>
                {selected === "calculator" ? (
                  <input
                    id="tool-value"
                    className="text-input"
                    required
                    placeholder="(125 + 75) / 4"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                  />
                ) : (
                  <textarea
                    id="tool-value"
                    className="text-input code-input"
                    required
                    rows={6}
                    placeholder={'{"idea": "something new"}'}
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                  />
                )}
                <Button type="submit">
                  {selected === "calculator" ? <Calculator /> : <Braces />}
                  {selected === "calculator" ? "Calculate" : "Format JSON"}
                </Button>
                <p className="privacy-caption">
                  {selected === "calculator"
                    ? "Supports +, −, *, /, %, and parentheses. % is the remainder operator."
                    : "Formats and validates locally. AI coding assistance is not connected."}
                </p>
              </form>
            ) : selected === "files" ? (
              <>
                <input
                  ref={fileInput}
                  type="file"
                  accept=".txt,.md,.json,.csv,.log,.ts,.js,.py,.html,.css"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void readFile(file);
                    e.target.value = "";
                  }}
                />
                <Button
                  variant="outline"
                  disabled={loading}
                  onClick={() => fileInput.current?.click()}
                >
                  <Upload />
                  Choose a text file
                </Button>
                <p className="privacy-caption">
                  Local preview up to 2 MB. Summaries and document intelligence require an AI
                  provider.
                </p>
                {fileName && <span className="metadata">{fileName}</span>}
              </>
            ) : (
              <div className="integration-empty">
                <tool.icon />
                <h3>
                  {selected === "memory" ? "Memory requires setup." : "Your device, connected."}
                </h3>
                <p>
                  {selected === "memory"
                    ? "Persistent AI memory requires a storage and retrieval provider. No memories are being saved or recalled."
                    : "Native Android actions, notifications, and device controls require a verified host bridge. No devices are connected."}
                </p>
                <span className="preview-chip">Not connected</span>
              </div>
            )}
            {loading && (
              <div className="response-loading" role="status" aria-label="Reading local file">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            )}
            {error && <Notice>{error}</Notice>}
            {result && (
              <div className="tool-output">
                <div className="section-heading">
                  <span className="metadata">
                    {selected === "files" ? "File preview" : "Result"}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(result);
                        setCopied(true);
                      } catch {
                        setError("Clipboard access is unavailable.");
                      }
                    }}
                  >
                    {copied ? <Check /> : <Copy />}
                    {copied ? "Copied" : "Copy"}
                  </Button>
                </div>
                <pre>{result}</pre>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
