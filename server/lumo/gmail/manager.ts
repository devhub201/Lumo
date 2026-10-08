import { nanoid } from "nanoid";
import type { PermissionManager } from "../security/permissions";
import {
  requireSensitiveAuthorization,
  type SensitiveActionAuthorization,
} from "../security/safety";
import type { GmailOperation, GmailProvider, GmailResult } from "./contracts";
const ok = <T>(
  operation: GmailOperation,
  requestId: string,
  data: T
): GmailResult<T> => ({
  success: true,
  operation,
  data,
  error: null,
  requestId,
});
const fail = <T>(
  operation: GmailOperation,
  requestId: string,
  error: unknown
): GmailResult<T> => {
  const raw = error instanceof Error ? error.message : "provider_failed";
  const code = raw.split(" ")[0] || "provider_failed";
  return {
    success: false,
    operation,
    data: null,
    error: {
      code,
      message:
        code === "authorization_required"
          ? "Gmail authorization is required."
          : "Gmail operation failed.",
      retryable: [
        "rate_limited",
        "provider_unavailable",
        "token_expired",
      ].includes(code),
    },
    requestId,
  };
};
const validEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
export class GmailManager {
  constructor(
    private readonly permissions: PermissionManager,
    private readonly provider: GmailProvider
  ) {}
  private allowed(owner: string) {
    if (!this.permissions.evaluate(owner, "account_services").allowed)
      throw new Error("permission_denied");
  }
  private sensitive(auth: SensitiveActionAuthorization | undefined) {
    if (!requireSensitiveAuthorization(auth, "gmail.send"))
      throw new Error("authorization_required");
  }
  async account(owner: string, requestId = nanoid()) {
    try {
      this.allowed(owner);
      return ok("list_messages", requestId, await this.provider.getAccount());
    } catch (e) {
      return fail("list_messages", requestId, e);
    }
  }
  async list(owner: string, limit = 20, requestId = nanoid()) {
    try {
      this.allowed(owner);
      return ok(
        "list_messages",
        requestId,
        await this.provider.listMessages(Math.min(limit, 50))
      );
    } catch (e) {
      return fail("list_messages", requestId, e);
    }
  }
  async search(owner: string, query: string, limit = 20, requestId = nanoid()) {
    try {
      this.allowed(owner);
      if (!query.trim()) throw new Error("invalid_input");
      return ok(
        "search_messages",
        requestId,
        await this.provider.searchMessages(
          query.slice(0, 300),
          Math.min(limit, 50)
        )
      );
    } catch (e) {
      return fail("search_messages", requestId, e);
    }
  }
  async message(owner: string, id: string, requestId = nanoid()) {
    try {
      this.allowed(owner);
      return ok(
        "inspect_message",
        requestId,
        await this.provider.getMessage(id)
      );
    } catch (e) {
      return fail("inspect_message", requestId, e);
    }
  }
  async thread(owner: string, id: string, requestId = nanoid()) {
    try {
      this.allowed(owner);
      return ok("inspect_thread", requestId, await this.provider.getThread(id));
    } catch (e) {
      return fail("inspect_thread", requestId, e);
    }
  }
  async labels(owner: string, requestId = nanoid()) {
    try {
      this.allowed(owner);
      return ok("list_labels", requestId, await this.provider.listLabels());
    } catch (e) {
      return fail("list_labels", requestId, e);
    }
  }
  async draft(
    owner: string,
    input: { to: string[]; subject: string; body: string },
    requestId = nanoid()
  ) {
    try {
      this.allowed(owner);
      if (!input.to.length || input.to.some(x => !validEmail(x)))
        throw new Error("invalid_input");
      if (input.subject.length > 300 || input.body.length > 100_000)
        throw new Error("invalid_input");
      return ok(
        "create_draft",
        requestId,
        await this.provider.createDraft(input)
      );
    } catch (e) {
      return fail("create_draft", requestId, e);
    }
  }
  async send(
    owner: string,
    input: {
      to: string[];
      subject: string;
      body: string;
      idempotencyKey: string;
    },
    auth?: SensitiveActionAuthorization,
    requestId = nanoid()
  ) {
    try {
      this.allowed(owner);
      this.sensitive(auth);
      if (!input.to.length || input.to.some(x => !validEmail(x)))
        throw new Error("invalid_input");
      if (!input.idempotencyKey || input.idempotencyKey.length > 120)
        throw new Error("invalid_input");
      return ok("send", requestId, await this.provider.send(input));
    } catch (e) {
      return fail("send", requestId, e);
    }
  }
}
