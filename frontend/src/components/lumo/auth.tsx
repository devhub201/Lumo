import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  Fingerprint,
  KeyRound,
  LockKeyhole,
  ShieldCheck,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { getIntegrations } from "@/lib/lumo/integrations";
import { isLumoBackendConfigured, startGoogleSignIn } from "@/lib/lumo/backend";
import { Orb } from "./orb";
import { Notice } from "./ui";
import { AccountForm } from "./account";
export function AuthScreen({ reason = "" }: { reason?: string }) {
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [recovery, setRecovery] = useState(false);
  const [email, setEmail] = useState("");
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  const authenticate = async () => {
    const provider = getIntegrations().authenticate;
    if (!provider) {
      setState("error");
      setMessage(
        "Biometric authentication is unavailable. Connect a native or browser identity provider to continue.",
      );
      return;
    }
    const controller = new AbortController();
    abort.current = controller;
    setState("loading");
    setMessage("");
    try {
      const result = await provider(controller.signal);
      if (controller.signal.aborted) return;
      setState(result.verified ? "success" : "error");
      setMessage(
        result.verified
          ? "Your provider confirmed verification. No backend account session is created by this frontend."
          : "Identity could not be verified. Please try again.",
      );
    } catch {
      setState("error");
      setMessage(
        controller.signal.aborted
          ? "Verification was cancelled."
          : "Verification failed or was cancelled. Please try again.",
      );
    }
  };
  const recover = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setMessage("Enter a valid email address.");
      return;
    }
    const provider = getIntegrations().recoverIdentity;
    if (!provider) {
      setMessage("Recovery is not connected. No email has been sent.");
      return;
    }
    const controller = new AbortController();
    abort.current = controller;
    setState("loading");
    try {
      await provider(email, controller.signal);
      if (!controller.signal.aborted) {
        setState("idle");
        setMessage("Your recovery provider accepted the request. Check your email.");
      }
    } catch {
      setState("error");
      setMessage("The recovery request could not be completed.");
    }
  };
  return (
    <div className="auth-page">
      <Button asChild variant="ghost" className="auth-back">
        <Link to="/">
          <ArrowLeft />
          Back to workspace
        </Link>
      </Button>
      <div className="auth-layout">
        <div className="auth-core">
          <Orb
            state={
              state === "error"
                ? "error"
                : state === "loading"
                  ? "loading"
                  : state === "success"
                    ? "success"
                    : "idle"
            }
          />
          <span className="core-caption">
            LUMO <span className="caption-divider" />A space that’s yours.
          </span>
        </div>
        <section className="auth-form">
          <span className="eyebrow">Your personal intelligence</span>
          <h1>{recovery ? "Find your way back." : "Welcome to LUMO."}</h1>
          <p className="auth-description">
            {recovery
              ? "Recover access through your connected identity provider."
              : "Your ideas. Your perspective. Your workspace."}
          </p>
          {reason === "expired" && <Notice>Your session expired. Please sign in again.</Notice>}
          {reason === "unauthorized" && <Notice>You need to sign in to open that page.</Notice>}
          {reason === "mobile_signin_failed" && (
            <Notice>Mobile sign-in did not complete. Please try Google sign-in again.</Notice>
          )}
          <div className="auth-identity">
            <LockKeyhole />
            <div>
              <strong>Verify your identity</strong>
              <p>
                {recovery
                  ? "Recovery requires a configured provider."
                  : "A private connection starts with you."}
              </p>
            </div>
          </div>
          {!recovery && (
            <Button
              variant="outline"
              className="auth-google"
              disabled={!isLumoBackendConfigured() || state === "loading"}
              onClick={() => {
                setState("loading");
                setMessage("");
                void startGoogleSignIn()
                  .then(() => {
                    setState("idle");
                    setMessage(
                      "Complete Google sign-in in the secure browser, then return to LUMO.",
                    );
                  })
                  .catch((error) => {
                    setState("error");
                    setMessage(
                      error instanceof Error ? error.message : "Google sign-in is unavailable.",
                    );
                  });
              }}
            >
              Continue with Google
            </Button>
          )}
          {recovery ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void recover();
              }}
            >
              <label className="input-label" htmlFor="recovery-email">
                Email address
              </label>
              <input
                id="recovery-email"
                className="text-input"
                type="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Button type="submit" disabled={state === "loading"} className="auth-primary">
                <KeyRound />
                Request recovery
                <ArrowRight />
              </Button>
            </form>
          ) : (
            <Button
              onClick={() => void authenticate()}
              disabled={state === "loading"}
              className="auth-primary"
            >
              <Fingerprint />
              {state === "loading" ? "Waiting for verification…" : "Continue with biometrics"}
              <ArrowRight />
            </Button>
          )}
          {state === "loading" && (
            <Button
              variant="outline"
              onClick={() => {
                abort.current?.abort();
                setState("idle");
                setMessage("Verification was cancelled.");
              }}
            >
              <X />
              Cancel
            </Button>
          )}
          <Button
            variant="ghost"
            className="auth-secondary"
            onClick={() => {
              setRecovery(!recovery);
              setMessage("");
              setState("idle");
            }}
          >
            <KeyRound />
            {recovery ? "Return to biometrics" : "Use account recovery"}
          </Button>
          {message && <Notice>{message}</Notice>}
          {!recovery && (
            <div className="auth-divider">
              <span>or use email</span>
            </div>
          )}
          {!recovery && <AccountForm />}
          <div className="auth-privacy">
            <ShieldCheck />
            <p>
              Google sign-in uses the configured LUMO backend and only requests identity scopes.
              Gmail access remains a separate, explicit integration.
            </p>
          </div>
          <span className="metadata">Identity interface · Requires integration</span>
        </section>
      </div>
    </div>
  );
}
