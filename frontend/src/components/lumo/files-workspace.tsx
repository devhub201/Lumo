import { useEffect, useRef, useState } from "react";
import {
  FileQuestion,
  FileText,
  FolderOpen,
  Image as ImageIcon,
  Music,
  Trash2,
  Upload,
  Video,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmButton } from "./confirm";
import { EmptyState, WorkspaceHeader } from "./workspaces";

type Kind = "image" | "text" | "pdf" | "audio" | "video" | "unsupported";
interface LocalFile {
  id: string;
  file: File;
  kind: Kind;
  url: string;
  text?: string | undefined;
  error?: string | undefined;
  loading: boolean;
}
const TEXT = /\.(txt|md|json|csv|log|ts|tsx|js|jsx|py|html|css|xml|yml|yaml|toml|sh)$/i;
export function fileKind(file: File): Kind {
  if (file.type.startsWith("image/")) return "image";
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) return "pdf";
  if (file.type.startsWith("audio/")) return "audio";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("text/") || TEXT.test(file.name)) return "text";
  return "unsupported";
}
const icons = {
  image: ImageIcon,
  text: FileText,
  pdf: FileText,
  audio: Music,
  video: Video,
  unsupported: FileQuestion,
};
const size = (n: number) =>
  n < 1024
    ? `${n} B`
    : n < 1048576
      ? `${(n / 1024).toFixed(1)} KB`
      : `${(n / 1048576).toFixed(1)} MB`;

export function FilesWorkspace() {
  const [files, setFiles] = useState<LocalFile[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const filesRef = useRef(files);
  filesRef.current = files;
  useEffect(() => () => filesRef.current.forEach((f) => URL.revokeObjectURL(f.url)), []);

  const add = (list: FileList | File[]) => {
    const added = Array.from(list).map<LocalFile>((file) => ({
      id: crypto.randomUUID(),
      file,
      kind: fileKind(file),
      url: URL.createObjectURL(file),
      loading: fileKind(file) === "text",
    }));
    if (!added.length) return;
    setFiles((old) => [...old, ...added]);
    setSelected((s) => s ?? added[0]!.id);
    toast.success(`${added.length} file${added.length > 1 ? "s" : ""} opened locally`);
    added
      .filter((f) => f.kind === "text")
      .forEach(async (f) => {
        const patch: Partial<LocalFile> = { loading: false };
        if (f.file.size > 2 * 1024 * 1024) patch.error = "Text previews are limited to 2 MB.";
        else {
          try {
            patch.text = await f.file.text();
          } catch {
            patch.error = "This file could not be read.";
          }
        }
        setFiles((old) => old.map((o) => (o.id === f.id ? { ...o, ...patch } : o)));
      });
  };
  const remove = (id: string) => {
    setFiles((old) => {
      const gone = old.find((f) => f.id === id);
      if (gone) URL.revokeObjectURL(gone.url);
      const next = old.filter((f) => f.id !== id);
      if (selected === id) setSelected(next[0]?.id ?? null);
      return next;
    });
  };
  const current = files.find((f) => f.id === selected);

  return (
    <div
      className="ws-page"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        add(e.dataTransfer.files);
      }}
    >
      <WorkspaceHeader eyebrow="Workspace" title="Files & documents">
        <input
          ref={input}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) add(e.target.files);
            e.target.value = "";
          }}
        />
        {files.length > 0 && (
          <ConfirmButton
            title="Close all files?"
            description="Files are removed from this workspace. The originals on your device are not affected."
            confirm="Close all"
            onConfirm={() => {
              files.forEach((f) => URL.revokeObjectURL(f.url));
              setFiles([]);
              setSelected(null);
            }}
          >
            <Trash2 />
            Close all
          </ConfirmButton>
        )}
        <Button size="sm" onClick={() => input.current?.click()}>
          <Upload />
          Open files
        </Button>
      </WorkspaceHeader>
      {!files.length ? (
        <div className={`ws-dropzone ${dragging ? "is-dragging" : ""}`}>
          <EmptyState
            icon={<FolderOpen />}
            title="No files open"
            action={
              <Button variant="outline" onClick={() => input.current?.click()}>
                <Upload />
                Choose files
              </Button>
            }
          >
            Drop files here or choose them from your device. They stay in this browser — nothing is
            uploaded. AI document analysis is not connected.
          </EmptyState>
        </div>
      ) : (
        <div className="files-layout">
          <ul className="files-list" aria-label="Open files">
            {files.map((f) => {
              const Icon = icons[f.kind];
              return (
                <li key={f.id} className={f.id === selected ? "selected" : ""}>
                  <button
                    type="button"
                    onClick={() => setSelected(f.id)}
                    aria-current={f.id === selected}
                  >
                    <Icon size={15} />
                    <span>
                      <strong>{f.file.name}</strong>
                      <small>
                        {size(f.file.size)} ·{" "}
                        {f.kind === "unsupported" ? "No preview" : f.kind.toUpperCase()}
                      </small>
                    </span>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Close ${f.file.name}`}
                    title="Close file"
                    onClick={() => remove(f.id)}
                  >
                    <X />
                  </Button>
                </li>
              );
            })}
          </ul>
          <section className="files-preview" aria-label="Preview">
            {current &&
              (current.loading ? (
                <div className="p-6 grid gap-3" role="status" aria-label="Reading file">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-5/6" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              ) : current.error ? (
                <EmptyState icon={<FileQuestion />} title="Preview failed">
                  {current.error}
                </EmptyState>
              ) : current.kind === "image" ? (
                <img src={current.url} alt={current.file.name} />
              ) : current.kind === "pdf" ? (
                <iframe title={current.file.name} src={current.url} />
              ) : current.kind === "audio" ? (
                <audio controls src={current.url} />
              ) : current.kind === "video" ? (
                <video controls src={current.url} />
              ) : current.kind === "text" ? (
                <pre>{current.text}</pre>
              ) : (
                <EmptyState icon={<FileQuestion />} title="Unsupported format">
                  LUMO can't preview “{current.file.name}”. Images, PDFs, audio, video, and text
                  files are supported.
                </EmptyState>
              ))}
          </section>
        </div>
      )}
    </div>
  );
}
