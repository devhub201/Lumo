import { untrustedDataBoundary } from "../security/safety";
import { OAuthFoundationService, type OAuthPersistence } from "../oauth/storage";
import type { OAuthTokenCipher } from "../oauth/crypto";
import type {
  GmailAccount,
  GmailAttachment,
  GmailDraft,
  GmailLabel,
  GmailMessage,
  GmailProvider,
  GmailThread,
} from "./contracts";

const API = "https://gmail.googleapis.com/gmail/v1/users/me";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USER_AGENT = "LUMO-Gmail";
type Fetcher = typeof fetch;
type GoogleConfig = { clientId: string; clientSecret: string };

const text = (value: unknown) => (typeof value === "string" ? value : "");
const decode = (value: unknown) => {
  if (typeof value !== "string") return "";
  try {
    return Buffer.from(value, "base64url").toString("utf8");
  } catch {
    return "";
  }
};
const header = (headers: unknown, name: string) => {
  if (!Array.isArray(headers)) return "";
  const item = headers.find(value => {
    const row = value as Record<string, unknown>;
    return text(row.name).toLowerCase() === name.toLowerCase();
  }) as Record<string, unknown> | undefined;
  return text(item?.value);
};
const dateValue = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : Date.now();
};

export class RealGmailProvider implements GmailProvider {
  constructor(
    private readonly ownerKey: string,
    private readonly persistence: OAuthPersistence,
    private readonly cipher: OAuthTokenCipher,
    private readonly config: GoogleConfig,
    private readonly fetchImpl: Fetcher = fetch,
    private readonly now: () => Date = () => new Date()
  ) {}

  async getAccount(): Promise<GmailAccount> {
    const profile = (await this.api("/profile")) as Record<string, unknown>;
    const connection = await this.connection();
    return {
      id: connection.providerAccountId,
      email: text(profile.emailAddress) || connection.providerLogin || "",
      displayName: null,
      authState: "connected",
      scopes: connection.scopes,
      connectedAt: connection.lastValidatedAt?.getTime() ?? null,
    };
  }

  async listMessages(limit: number): Promise<GmailMessage[]> {
    const result = (await this.api(`/messages?maxResults=${Math.min(limit, 50)}`)) as Record<string, unknown>;
    return this.loadMessageRefs(result.messages);
  }

  async searchMessages(query: string, limit: number): Promise<GmailMessage[]> {
    const result = (await this.api(`/messages?maxResults=${Math.min(limit, 50)}&q=${encodeURIComponent(query)}`)) as Record<string, unknown>;
    return this.loadMessageRefs(result.messages);
  }

  async getMessage(id: string): Promise<GmailMessage> {
    const row = await this.api(`/messages/${encodeURIComponent(id)}?format=full`);
    return this.message(row);
  }

  async getThread(id: string): Promise<GmailThread> {
    const row = (await this.api(`/threads/${encodeURIComponent(id)}?format=full`)) as Record<string, unknown>;
    const messages = Array.isArray(row.messages)
      ? await Promise.all(row.messages.map(item => this.message(item)))
      : [];
    return {
      id,
      messageIds: messages.map(message => message.id),
      subject: messages[0]?.subject ?? "",
      messages,
    };
  }

  async listLabels(): Promise<GmailLabel[]> {
    const result = (await this.api("/labels")) as Record<string, unknown>;
    return (Array.isArray(result.labels) ? result.labels : []).map(item => {
      const row = item as Record<string, unknown>;
      return {
        id: text(row.id),
        name: untrustedDataBoundary(text(row.name)),
        type: row.type === "user" ? "user" : "system",
      };
    });
  }

  async createDraft(input: { to: string[]; subject: string; body: string }): Promise<GmailDraft> {
    const result = (await this.api("/drafts", {
      method: "POST",
      body: { message: { raw: this.rawMessage(input) } },
    })) as Record<string, unknown>;
    const message = result.message as Record<string, unknown> | undefined;
    return {
      id: text(result.id),
      threadId: text(message?.threadId) || null,
      to: [...input.to],
      subject: input.subject,
      body: input.body,
      createdAt: this.now().getTime(),
      status: "draft",
    };
  }

  async send(input: {
    to: string[];
    subject: string;
    body: string;
    idempotencyKey: string;
  }) {
    const result = (await this.api("/messages/send", {
      method: "POST",
      body: { raw: this.rawMessage(input) },
    })) as Record<string, unknown>;
    return {
      providerMessageId: text(result.id),
      sentAt: this.now().getTime(),
    };
  }

  private async loadMessageRefs(value: unknown): Promise<GmailMessage[]> {
    if (!Array.isArray(value)) return [];
    return Promise.all(
      value
        .slice(0, 50)
        .map(item => text((item as Record<string, unknown>).id))
        .filter(Boolean)
        .map(id => this.getMessage(id))
    );
  }

  private message(value: unknown): GmailMessage {
    const row = value as Record<string, unknown>;
    const payload = (row.payload ?? {}) as Record<string, unknown>;
    const headers = payload.headers;
    const parts = this.parts(payload);
    const bodyPart = parts.find(part => text(part.mimeType) === "text/plain") ??
      parts.find(part => text(part.mimeType) === "text/html") ??
      payload;
    const to = header(headers, "to")
      .split(",")
      .map(value => value.trim())
      .filter(Boolean);
    return {
      id: text(row.id),
      threadId: text(row.threadId),
      from: untrustedDataBoundary(header(headers, "from")),
      to: to.map(value => untrustedDataBoundary(value)),
      subject: untrustedDataBoundary(header(headers, "subject")),
      body: untrustedDataBoundary(decode((bodyPart as Record<string, unknown>).body && ((bodyPart as Record<string, unknown>).body as Record<string, unknown>).data)),
      receivedAt: dateValue(row.internalDate),
      labels: Array.isArray(row.labelIds) ? row.labelIds.map(text) : [],
      attachments: parts
        .filter(part => text(part.filename) && Boolean(((part.body ?? {}) as Record<string, unknown>).attachmentId))
        .map(part => {
          const body = (part.body ?? {}) as Record<string, unknown>;
          return {
            id: text(body.attachmentId),
            filename: untrustedDataBoundary(text(part.filename)),
            mimeType: text(part.mimeType),
            size: Number(body.size ?? 0),
            contentAvailable: false,
          } satisfies GmailAttachment;
        }),
      contentTrust: "untrusted_external_data",
    };
  }

  private parts(payload: Record<string, unknown>): Array<Record<string, unknown>> {
    const result: Array<Record<string, unknown>> = [];
    const visit = (part: Record<string, unknown>) => {
      result.push(part);
      if (Array.isArray(part.parts))
        for (const child of part.parts) visit(child as Record<string, unknown>);
    };
    visit(payload);
    return result;
  }

  private rawMessage(input: { to: string[]; subject: string; body: string }) {
    const mime = [
      `To: ${input.to.join(", ")}`,
      `Subject: ${input.subject}`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
      "",
      input.body,
    ].join("\r\n");
    return Buffer.from(mime, "utf8").toString("base64url");
  }

  private async connection() {
    const connection = await this.persistence.getConnection(this.ownerKey, "google");
    if (!connection || connection.state === "revoked" || connection.state === "expired" || connection.state === "error")
      throw new Error("authorization_required");
    return connection;
  }

  private async accessToken() {
    let connection = await this.connection();
    if (
      connection.accessTokenExpiresAt &&
      connection.accessTokenExpiresAt.getTime() <= this.now().getTime() + 60_000
    ) {
      if (!connection.refreshTokenCiphertext) {
        await this.persistence.setConnectionState(this.ownerKey, "google", "expired");
        throw new Error("token_expired");
      }
      let refreshToken: string;
      try {
        refreshToken = this.cipher.decrypt(connection.refreshTokenCiphertext);
      } catch {
        await this.persistence.setConnectionState(this.ownerKey, "google", "expired");
        throw new Error("token_expired");
      }
      const response = await this.fetchImpl(TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json", "User-Agent": USER_AGENT },
        body: new URLSearchParams({
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          grant_type: "refresh_token",
          refresh_token: refreshToken,
        }).toString(),
      });
      const body = await this.json(response);
      const access = text(body.access_token);
      if (!response.ok || !access) {
        await this.persistence.setConnectionState(this.ownerKey, "google", "expired");
        throw new Error("token_expired");
      }
      const expiresIn = Number(body.expires_in);
      await new OAuthFoundationService(this.persistence, this.cipher, this.now).saveProviderTokens({
        ownerKey: this.ownerKey,
        provider: "google",
        providerAccountId: connection.providerAccountId,
        providerLogin: connection.providerLogin,
        accessToken: access,
        refreshToken: text(body.refresh_token) || refreshToken,
        accessTokenExpiresAt: Number.isSafeInteger(expiresIn) && expiresIn > 0
          ? new Date(this.now().getTime() + expiresIn * 1000)
          : null,
        scopes: connection.scopes,
      });
      connection = await this.connection();
    }
    try {
      return this.cipher.decrypt(connection.accessTokenCiphertext);
    } catch {
      await this.persistence.setConnectionState(this.ownerKey, "google", "expired");
      throw new Error("token_expired");
    }
  }

  private async api(path: string, input: { method?: string; body?: unknown } = {}) {
    const token = await this.accessToken();
    const response = await this.fetchImpl(`${API}${path}`, {
      method: input.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
      },
      ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
    });
    const body = await this.json(response);
    if (response.status === 401) {
      await this.persistence.setConnectionState(this.ownerKey, "google", "expired");
      throw new Error("token_expired");
    }
    if (!response.ok) throw new Error("provider_unavailable");
    return body;
  }

  private async json(response: Response) {
    try {
      return (await response.json()) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
}
