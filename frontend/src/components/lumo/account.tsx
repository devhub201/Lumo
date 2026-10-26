import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Eye, EyeOff, LogOut, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getWorkspaceIntegrations } from "@/lib/lumo/integrations";
import { ConfirmButton } from "./confirm";
import { Notice, Status } from "./ui";

export function validateCredentials(email: string, password: string, signup: boolean) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Enter a valid email address.";
  if (!password) return "Enter your password.";
  if (signup && password.length < 8) return "Use at least 8 characters for your password.";
  return "";
}

/** Email sign-in / sign-up, active only when a host account adapter exists. */
export function AccountForm() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [available, setAvailable] = useState(false);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => {
    setAvailable(!!getWorkspaceIntegrations().account);
    return () => abort.current?.abort();
  }, []);
  const submit = async () => {
    const invalid = validateCredentials(email, password, mode === "signup");
    if (invalid) {
      setState("error");
      setMessage(invalid);
      return;
    }
    const account = getWorkspaceIntegrations().account;
    if (!account) {
      setState("error");
      setMessage("Accounts are not connected yet. No sign-in request was sent.");
      return;
    }
    const c = new AbortController();
    abort.current = c;
    setState("loading");
    setMessage("");
    try {
      const r = await (mode === "signin" ? account.signIn : account.signUp)(
        email,
        password,
        c.signal,
      );
      setState(r.ok ? "success" : "error");
      setMessage(
        r.message ??
          (r.ok
            ? mode === "signin"
              ? "Signed in."
              : "Account created. Check your email if confirmation is required."
            : "Those details were not accepted."),
      );
    } catch {
      if (!c.signal.aborted) {
        setState("error");
        setMessage("The account service could not be reached. Please try again.");
      }
    }
  };
  return (
    <form
      className="account-form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="segmented" aria-label="Account mode">
        {(["signin", "signup"] as const).map((m) => (
          <Button
            key={m}
            type="button"
            variant="ghost"
            aria-pressed={mode === m}
            onClick={() => {
              setMode(m);
              setMessage("");
              setState("idle");
            }}
          >
            {m === "signin" ? "Sign in" : "Create account"}
          </Button>
        ))}
      </div>
      <label className="input-label" htmlFor="account-email">
        Email
      </label>
      <input
        id="account-email"
        className="text-input"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        aria-invalid={state === "error" && !/@/.test(email)}
      />
      <label className="input-label" htmlFor="account-password">
        Password
      </label>
      <div className="password-field">
        <input
          id="account-password"
          className="text-input"
          type={show ? "text" : "password"}
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={show ? "Hide password" : "Show password"}
          onClick={() => setShow((s) => !s)}
        >
          {show ? <EyeOff /> : <Eye />}
        </Button>
      </div>
      <Button type="submit" className="auth-primary" disabled={state === "loading"}>
        {state === "loading" ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
      </Button>
      {!available && (
        <p className="metadata">
          Email accounts require the LUMO account service, which isn't connected in this preview.
        </p>
      )}
      {message &&
        (state === "success" ? (
          <p className="status" role="status">
            <span />
            {message}
          </p>
        ) : (
          <Notice>{message}</Notice>
        ))}
    </form>
  );
}

/** Settings → Account. Shows only what the account adapter confirms. */
export function AccountSection() {
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState(false);
  const [user, setUser] = useState<{ email: string; name?: string | undefined } | null>(null);
  const [error, setError] = useState("");
  const load = async () => {
    const account = getWorkspaceIntegrations().account;
    setAvailable(!!account);
    setError("");
    if (!account) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setUser(await account.current(new AbortController().signal));
    } catch {
      setError("Your account could not be loaded.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const signOut = async () => {
    try {
      await getWorkspaceIntegrations().account?.signOut();
      setUser(null);
      toast("Signed out");
    } catch {
      toast.error("Sign out failed. Please try again.");
    }
  };
  return (
    <div className="integration-row">
      <span className="tool-icon">
        <UserRound />
      </span>
      <div className="min-w-0">
        <div className="flex items-center gap-3 flex-wrap">
          <strong>{user?.name || user?.email || "Account"}</strong>
          {loading ? (
            <Skeleton className="h-3 w-20" />
          ) : (
            <Status warning={!user}>
              {!available ? "Account service not connected" : user ? "Signed in" : "Signed out"}
            </Status>
          )}
        </div>
        <p>
          {!available
            ? "Profiles and sign-in need the LUMO account service. Preferences on this page are stored on this device only."
            : user
              ? user.email
              : "Sign in to sync your account."}
        </p>
        {error && (
          <p className="field-error">
            {error}{" "}
            <Button variant="link" size="sm" onClick={() => void load()}>
              Retry
            </Button>
          </p>
        )}
      </div>
      <div className="integration-actions">
        {user ? (
          <ConfirmButton
            variant="outline"
            title="Sign out of LUMO?"
            description="You'll need to sign in again to use account features."
            confirm="Sign out"
            onConfirm={() => void signOut()}
          >
            <LogOut />
            Sign out
          </ConfirmButton>
        ) : (
          <Button asChild size="sm" variant="outline">
            <Link to="/auth">Sign in</Link>
          </Button>
        )}
      </div>
    </div>
  );
}
