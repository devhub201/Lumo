import { Streamdown } from "streamdown";
import {
  AlertTriangle,
  BrainCircuit,
  Check,
  ChevronRight,
  CircleDot,
  Clock3,
  Database,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Send,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import { useMemo, useState, type FormEvent, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";

type MemoryKind = "preference" | "fact" | "project" | "summary" | "knowledge";

type Message = {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  createdAt: Date;
};

const formatTime = (value: Date | string) =>
  new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));

const formatDate = (value: Date | string) =>
  new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(
    new Date(value)
  );

export default function Home() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [pendingText, setPendingText] = useState<string | null>(null);
  const [failedText, setFailedText] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [lastDiagnostics, setLastDiagnostics] = useState<{
    requestId: string;
    model: string;
    elapsedMs: number;
    contextMessageCount: number;
    retrievedMemoryCount: number;
    depthLevel: number;
  } | null>(null);
  const [memoryKind, setMemoryKind] = useState<MemoryKind>("fact");
  const [memoryDraft, setMemoryDraft] = useState("");
  const [memoryStatus, setMemoryStatus] = useState<string | null>(null);

  const conversationsQuery = trpc.lumo.listConversations.useQuery();
  const diagnosticsQuery = trpc.lumo.diagnostics.useQuery();
  const memoriesQuery = trpc.lumo.listMemories.useQuery();
  const conversationQuery = trpc.lumo.getConversation.useQuery(
    { id: selectedId ?? "" },
    { enabled: Boolean(selectedId) }
  );
  const utils = trpc.useUtils();
  const sendMutation = trpc.lumo.send.useMutation();
  const memoryMutation = trpc.lumo.createMemory.useMutation();

  const messages = (conversationQuery.data?.messages ?? []) as Message[];
  const activeConversation = conversationQuery.data?.conversation;
  const displayTitle = activeConversation?.title ?? "New conversation";
  const sortedMemories = useMemo(
    () => (memoriesQuery.data ?? []).slice(0, 8),
    [memoriesQuery.data]
  );

  const selectConversation = (id: string) => {
    setSelectedId(id);
    setDraft("");
    setErrorText(null);
    setFailedText(null);
    setPendingText(null);
    setLastDiagnostics(null);
  };

  const startNewConversation = () => {
    setSelectedId(null);
    setDraft("");
    setErrorText(null);
    setFailedText(null);
    setPendingText(null);
    setLastDiagnostics(null);
  };

  const submitText = (text: string) => {
    const cleanText = text.trim();
    if (!cleanText || sendMutation.isPending) return;
    setErrorText(null);
    setFailedText(null);
    setPendingText(cleanText);
    sendMutation.mutate(
      { conversationId: selectedId ?? undefined, text: cleanText },
      {
        onSuccess: result => {
          setSelectedId(result.conversation.id);
          setPendingText(null);
          setDraft("");
          setLastDiagnostics(result.diagnostics);
          void Promise.all([
            utils.lumo.listConversations.invalidate(),
            utils.lumo.getConversation.invalidate({
              id: result.conversation.id,
            }),
          ]);
        },
        onError: error => {
          setPendingText(null);
          setDraft(cleanText);
          setFailedText(cleanText);
          setErrorText(error.message);
        },
      }
    );
  };

  const handleSend = (event: FormEvent) => {
    event.preventDefault();
    submitText(draft);
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      submitText(draft);
    }
  };

  const addMemory = (event: FormEvent) => {
    event.preventDefault();
    const content = memoryDraft.trim();
    if (!content || memoryMutation.isPending) return;
    setMemoryStatus(null);
    memoryMutation.mutate(
      { kind: memoryKind, content, importance: 60 },
      {
        onSuccess: () => {
          setMemoryDraft("");
          setMemoryStatus("Saved to Peter’s local memory store.");
          void utils.lumo.listMemories.invalidate();
        },
        onError: error => setMemoryStatus(error.message),
      }
    );
  };

  return (
    <div className="lumo-shell">
      <header className="lumo-topbar">
        <div className="lumo-brand">
          <span className="lumo-mark" aria-hidden="true">
            <CircleDot size={18} />
          </span>
          <div>
            <div className="lumo-wordmark">LUMO</div>
            <div className="lumo-kicker">
              personal intelligence / testing build
            </div>
          </div>
        </div>
        <div className="lumo-topbar-meta">
          <span className="status-pill">
            <span className="status-dot" /> core online
          </span>
          <span className="mono">owner: Peter</span>
        </div>
      </header>

      <div className="lumo-workbench">
        <aside className="lumo-sidebar" aria-label="Conversation history">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">workspace</p>
              <h2>Conversations</h2>
            </div>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={startNewConversation}
              aria-label="New conversation"
              title="New conversation"
            >
              <Plus size={16} />
            </Button>
          </div>
          <Button
            className="new-conversation-button"
            variant="secondary"
            onClick={startNewConversation}
          >
            <Plus size={15} /> New conversation
          </Button>
          <div className="conversation-list">
            {conversationsQuery.isLoading && (
              <div className="empty-note">
                <Loader2 className="spin" size={15} /> loading history
              </div>
            )}
            {!conversationsQuery.isLoading &&
              !conversationsQuery.data?.length && (
                <div className="empty-note">
                  No saved conversations yet. Start with a question.
                </div>
              )}
            {conversationsQuery.data?.map(conversation => (
              <button
                type="button"
                key={conversation.id}
                className={`conversation-row ${selectedId === conversation.id ? "selected" : ""}`}
                onClick={() => selectConversation(conversation.id)}
              >
                <span className="conversation-row-copy">
                  <strong>{conversation.title}</strong>
                  <span>
                    {formatDate(conversation.updatedAt)} · depth{" "}
                    {conversation.depthLevel}
                  </span>
                </span>
                <ChevronRight size={14} />
              </button>
            ))}
          </div>
          <div className="sidebar-footer">
            <div className="footer-line">
              <Database size={14} /> managed persistence
            </div>
            <div className="footer-line">
              <ShieldCheck size={14} /> server-only provider key
            </div>
          </div>
        </aside>

        <main className="lumo-main">
          <div className="conversation-header">
            <div>
              <p className="eyebrow">
                conversation / {selectedId ? selectedId.slice(0, 8) : "unsaved"}
              </p>
              <h1>{displayTitle}</h1>
            </div>
            <div className="conversation-header-actions">
              {activeConversation && (
                <span className="mono muted">
                  depth {activeConversation.depthLevel}
                </span>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void conversationQuery.refetch()}
                disabled={!selectedId || conversationQuery.isFetching}
              >
                <RefreshCw
                  size={14}
                  className={conversationQuery.isFetching ? "spin" : ""}
                />{" "}
                Refresh
              </Button>
            </div>
          </div>

          <div className="message-stage">
            {!selectedId && !pendingText && (
              <div className="welcome-card">
                <div className="welcome-icon">
                  <BrainCircuit size={22} />
                </div>
                <p className="eyebrow">LUMO core ready</p>
                <h2>Start a focused test.</h2>
                <p>
                  Try a normal question, add a memory in the diagnostics panel,
                  or ask “Go deeper.” after an explanation to test context
                  continuity.
                </p>
                <div className="test-steps">
                  <span>
                    <Check size={14} /> one provider
                  </span>
                  <span>
                    <Check size={14} /> structured memory
                  </span>
                  <span>
                    <Check size={14} /> persistent turns
                  </span>
                </div>
              </div>
            )}
            {messages.map(message => (
              <article
                className={`message-row ${message.role}`}
                key={message.id}
              >
                <div className="message-meta">
                  <span>
                    {message.role === "assistant" ? "LUMO" : message.role}
                  </span>
                  <span>{formatTime(message.createdAt)}</span>
                </div>
                <div className="message-bubble">
                  {message.role === "assistant" ? (
                    <Streamdown>{message.content}</Streamdown>
                  ) : (
                    <p>{message.content}</p>
                  )}
                </div>
              </article>
            ))}
            {pendingText && (
              <>
                <article className="message-row user pending-message">
                  <div className="message-meta">
                    <span>user</span>
                    <span>sending</span>
                  </div>
                  <div className="message-bubble">
                    <p>{pendingText}</p>
                  </div>
                </article>
                <article className="message-row assistant pending-message">
                  <div className="message-meta">
                    <span>LUMO</span>
                    <span>
                      <Loader2 size={13} className="spin" /> thinking
                    </span>
                  </div>
                  <div className="message-bubble thinking-bubble">
                    <span className="thinking-bar" />
                    <span className="thinking-bar short" />
                  </div>
                </article>
              </>
            )}
            {conversationQuery.isLoading && selectedId && !pendingText && (
              <div className="empty-note centered">
                <Loader2 className="spin" size={15} /> loading conversation
              </div>
            )}
          </div>

          {errorText && (
            <div className="error-banner" role="alert">
              <AlertTriangle size={16} />
              <span>{errorText}</span>
              {failedText && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => submitText(failedText)}
                  disabled={sendMutation.isPending}
                >
                  Retry
                </Button>
              )}
            </div>
          )}

          <form className="composer" onSubmit={handleSend}>
            <Textarea
              value={draft}
              onChange={event => setDraft(event.target.value)}
              onKeyDown={handleComposerKeyDown}
              placeholder="Message LUMO…"
              rows={3}
              disabled={sendMutation.isPending}
              aria-label="Message LUMO"
            />
            <div className="composer-footer">
              <span className="composer-hint">
                Cmd/Ctrl + Enter to send · input is kept on failure
              </span>
              <Button
                type="submit"
                disabled={!draft.trim() || sendMutation.isPending}
              >
                {sendMutation.isPending ? (
                  <Loader2 size={15} className="spin" />
                ) : (
                  <Send size={15} />
                )}{" "}
                Send
              </Button>
            </div>
          </form>
        </main>

        <aside className="lumo-inspector" aria-label="LUMO diagnostics">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">instrumentation</p>
              <h2>Diagnostics</h2>
            </div>
            <Terminal size={17} className="muted" />
          </div>

          <section className="inspector-section">
            <div className="section-label">
              <span>runtime</span>
              <span className="mono">safe view</span>
            </div>
            <div className="diagnostic-list">
              <DiagnosticRow
                label="provider"
                value={diagnosticsQuery.data?.provider ?? "loading"}
              />
              <DiagnosticRow
                label="api"
                value={
                  diagnosticsQuery.data?.apiConfigured
                    ? "configured"
                    : "not configured"
                }
                tone={diagnosticsQuery.data?.apiConfigured ? "good" : "warn"}
              />
              <DiagnosticRow
                label="database"
                value={
                  diagnosticsQuery.data?.databaseConfigured
                    ? "configured"
                    : "not configured"
                }
                tone={
                  diagnosticsQuery.data?.databaseConfigured ? "good" : "warn"
                }
              />
              <DiagnosticRow
                label="model"
                value={diagnosticsQuery.data?.model ?? "loading"}
              />
              <DiagnosticRow
                label="timeout"
                value={
                  diagnosticsQuery.data
                    ? `${Math.round(diagnosticsQuery.data.timeoutMs / 1000)}s`
                    : "—"
                }
              />
            </div>
          </section>

          <section className="inspector-section">
            <div className="section-label">
              <span>last turn</span>
              <Clock3 size={14} />
            </div>
            {lastDiagnostics ? (
              <div className="diagnostic-list">
                <DiagnosticRow
                  label="request"
                  value={lastDiagnostics.requestId}
                  mono
                />
                <DiagnosticRow
                  label="elapsed"
                  value={`${lastDiagnostics.elapsedMs}ms`}
                  mono
                />
                <DiagnosticRow
                  label="context"
                  value={`${lastDiagnostics.contextMessageCount} messages`}
                />
                <DiagnosticRow
                  label="memory"
                  value={`${lastDiagnostics.retrievedMemoryCount} retrieved`}
                />
                <DiagnosticRow
                  label="depth"
                  value={`level ${lastDiagnostics.depthLevel}`}
                />
              </div>
            ) : (
              <p className="empty-note">
                Send a message to inspect the assembled context.
              </p>
            )}
          </section>

          <section className="inspector-section memory-section">
            <div className="section-label">
              <span>memory test</span>
              <Save size={14} />
            </div>
            <form onSubmit={addMemory} className="memory-form">
              <select
                value={memoryKind}
                onChange={event =>
                  setMemoryKind(event.target.value as MemoryKind)
                }
                aria-label="Memory type"
              >
                <option value="fact">fact</option>
                <option value="preference">preference</option>
                <option value="project">project</option>
                <option value="summary">summary</option>
                <option value="knowledge">knowledge</option>
              </select>
              <Textarea
                value={memoryDraft}
                onChange={event => setMemoryDraft(event.target.value)}
                placeholder="Add a useful memory for Peter…"
                rows={3}
              />
              <Button
                type="submit"
                variant="outline"
                size="sm"
                disabled={!memoryDraft.trim() || memoryMutation.isPending}
              >
                {memoryMutation.isPending ? (
                  <Loader2 size={14} className="spin" />
                ) : (
                  <Save size={14} />
                )}{" "}
                Save memory
              </Button>
            </form>
            {memoryStatus && <p className="memory-status">{memoryStatus}</p>}
            <div className="memory-list">
              {!sortedMemories.length && (
                <p className="empty-note">No stored memories yet.</p>
              )}
              {sortedMemories.map(memory => (
                <div className="memory-item" key={memory.id}>
                  <div>
                    <span className="memory-kind">{memory.kind}</span>
                    <span className="mono muted">
                      {" "}
                      importance {memory.importance}
                    </span>
                  </div>
                  <p>{memory.content}</p>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function DiagnosticRow({
  label,
  value,
  tone = "neutral",
  mono = false,
}: {
  label: string;
  value: string;
  tone?: "neutral" | "good" | "warn";
  mono?: boolean;
}) {
  return (
    <div className="diagnostic-row">
      <span>{label}</span>
      <strong className={`${tone} ${mono ? "mono" : ""}`}>{value}</strong>
    </div>
  );
}
