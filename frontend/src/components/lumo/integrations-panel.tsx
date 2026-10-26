import { useCallback, useEffect, useState } from "react";
import { Github, Mail, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getWorkspaceIntegrations,
  type ConnectionId,
  type ConnectionStatus,
} from "@/lib/lumo/integrations";
import { ConfirmButton } from "./confirm";
import { Status } from "./ui";

const meta = {
  github: {
    name: "GitHub",
    icon: Github,
    about: "Repositories and code context for the Coding workspace.",
  },
  gmail: {
    name: "Gmail",
    icon: Mail,
    about: "Read and draft email when you ask LUMO. Sending always needs your confirmation.",
  },
} as const;

function Connection({ id }: { id: ConnectionId }) {
  const { name, icon: Icon, about } = meta[id];
  const [available, setAvailable] = useState<boolean | null>(null);
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const call = useCallback(
    async (action: "status" | "connect" | "disconnect") => {
      const adapter = getWorkspaceIntegrations().connections;
      setAvailable(!!adapter);
      if (!adapter) return;
      const c = new AbortController();
      setBusy(true);
      setError("");
      try {
        const next = await adapter[action](id, c.signal);
        setStatus(next);
        if (action === "connect") {
          if (next.connected) toast.success(`${name} connected`);
          else setError(`${name} authorization was not completed.`);
        }
        if (action === "disconnect" && !next.connected) toast(`${name} disconnected`);
      } catch (e) {
        setError(e instanceof Error ? e.message : `${name} could not be reached.`);
      } finally {
        setBusy(false);
      }
    },
    [id, name],
  );
  useEffect(() => {
    void call("status");
  }, [call]);
  const connected = !!status?.connected;
  return (
    <div className="integration-row">
      <span className="tool-icon">
        <Icon />
      </span>
      <div className="min-w-0">
        <div className="flex items-center gap-3 flex-wrap">
          <strong>{name}</strong>
          {available === null || (busy && !status) ? (
            <Skeleton className="h-3 w-20" />
          ) : !available ? (
            <Status warning>Requires LUMO backend</Status>
          ) : error ? (
            <Status warning>Error</Status>
          ) : (
            <Status warning={!connected}>{connected ? "Connected" : "Not connected"}</Status>
          )}
        </div>
        <p>{about}</p>
        {connected && status?.account && <p className="metadata">Account: {status.account}</p>}
        {connected && status?.scopes?.length ? (
          <p className="metadata">Permissions: {status.scopes.join(", ")}</p>
        ) : null}
        {id === "github" && connected && status?.repositories && (
          <p className="metadata">
            {status.repositories.length
              ? `Repositories: ${status.repositories.slice(0, 4).join(", ")}${status.repositories.length > 4 ? "…" : ""}`
              : "No repositories shared."}
          </p>
        )}
        {!available && available !== null && (
          <p className="metadata">
            No integration backend is connected, so {name} can't be authorized from this preview.
          </p>
        )}
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="integration-actions">
        {error && (
          <Button size="sm" variant="ghost" onClick={() => void call("status")} disabled={busy}>
            <RefreshCw />
            Retry
          </Button>
        )}
        {connected ? (
          <ConfirmButton
            variant="outline"
            disabled={busy}
            title={`Disconnect ${name}?`}
            description={`LUMO will lose access to ${name} until you reconnect.`}
            confirm="Disconnect"
            onConfirm={() => void call("disconnect")}
          >
            Disconnect
          </ConfirmButton>
        ) : (
          <Button
            size="sm"
            variant="outline"
            disabled={!available || busy}
            onClick={() => void call("connect")}
          >
            {busy && available ? "Connecting…" : error && status ? "Reconnect" : "Connect"}
          </Button>
        )}
      </div>
    </div>
  );
}
export function IntegrationsPanel() {
  return (
    <div className="integrations-list">
      <Connection id="github" />
      <Connection id="gmail" />
    </div>
  );
}
