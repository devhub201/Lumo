import { Button } from "@/components/ui/button";
import { ArrowUp, Paperclip, Mic, X } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
export function Status({ children, warning = false }: { children: ReactNode; warning?: boolean }) {
  return (
    <span className={`status ${warning ? "status-warning" : ""}`}>
      <span />
      {children}
    </span>
  );
}
export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="page-heading">
      <div className="min-w-0">
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </header>
  );
}
export function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="notice" role="status">
      {children}
    </div>
  );
}
export function Composer({
  onSend,
  initial = "",
  disabled = false,
}: {
  onSend: (text: string, files: File[]) => void;
  initial?: string;
  disabled?: boolean;
}) {
  const [text, setText] = useState(initial);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  return (
    <form
      className="composer"
      onSubmit={(e) => {
        e.preventDefault();
        if (!text.trim()) {
          setError("Enter a message to continue.");
          return;
        }
        onSend(text.trim(), files);
        setText("");
        setFiles([]);
        setError("");
      }}
    >
      {files.length > 0 && (
        <div className="attachments">
          {files.map((file, i) => (
            <span key={`${file.name}-${i}`}>
              {file.name}
              <Button
                aria-label={`Remove ${file.name}`}
                title={`Remove ${file.name}`}
                size="icon"
                variant="ghost"
                type="button"
                onClick={() => setFiles((old) => old.filter((_, index) => index !== i))}
              >
                <X />
              </Button>
            </span>
          ))}
        </div>
      )}
      <textarea
        aria-label="Message LUMO"
        placeholder="What’s on your mind?"
        value={text}
        disabled={disabled}
        rows={2}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            e.currentTarget.form?.requestSubmit();
          }
        }}
      />
      <div className="composer-bottom">
        <div className="flex items-center gap-2">
          <input
            ref={input}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              const added = Array.from(e.target.files ?? []);
              if (added.some((f) => f.size > 10 * 1024 * 1024)) {
                setError("Each attachment must be under 10 MB.");
                return;
              }
              setFiles((old) => [...old, ...added].slice(0, 5));
              e.target.value = "";
            }}
          />
          <Button
            aria-label="Attach files"
            title="Attach files"
            size="icon"
            variant="ghost"
            type="button"
            onClick={() => input.current?.click()}
          >
            <Paperclip />
          </Button>
          <span className="composer-hint">
            Frontend preview <span className="hint-separator">·</span> No AI connected
          </span>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="ghost" size="icon" title="Voice mode">
            <Link to="/voice" aria-label="Voice mode">
              <Mic />
            </Link>
          </Button>
          <Button
            size="icon"
            type="submit"
            disabled={disabled || !text.trim()}
            aria-label="Send message"
            title="Send message"
          >
            <ArrowUp />
          </Button>
        </div>
      </div>
      {error && <p className="field-error">{error}</p>}
    </form>
  );
}
