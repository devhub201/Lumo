import { nanoid } from "nanoid";
import type {
  GmailAccount,
  GmailDraft,
  GmailLabel,
  GmailMessage,
  GmailProvider,
  GmailThread,
} from "./contracts";
import { untrustedDataBoundary } from "../security/safety";
export class MockGmailProvider implements GmailProvider {
  private connected = false;
  private sent = new Set<string>();
  private drafts: GmailDraft[] = [];
  readonly messages: GmailMessage[] = [
    {
      id: "msg_mock_1",
      threadId: "thread_mock_1",
      from: "sender@example.test",
      to: ["mock@example.test"],
      subject: "Mock message",
      body: "This is external email data.",
      receivedAt: Date.now(),
      labels: ["INBOX"],
      attachments: [],
      contentTrust: "untrusted_external_data",
    },
  ];
  connect() {
    this.connected = true;
  }
  disconnect() {
    this.connected = false;
  }
  private auth() {
    if (!this.connected) throw new Error("authorization_required");
  }
  private safe(message: GmailMessage): GmailMessage {
    return {
      ...message,
      subject: untrustedDataBoundary(message.subject),
      body: untrustedDataBoundary(message.body),
    };
  }
  async getAccount(): Promise<GmailAccount> {
    return {
      id: "gmail_mock_account",
      email: "mock@example.test",
      displayName: "Mock Gmail Account",
      authState: this.connected ? "connected" : "disconnected",
      scopes: this.connected ? ["readonly", "drafts", "send"] : [],
      connectedAt: this.connected ? Date.now() : null,
    };
  }
  async listMessages(limit: number) {
    this.auth();
    return this.messages.slice(0, limit).map(m => this.safe(m));
  }
  async searchMessages(query: string, limit: number) {
    this.auth();
    const q = query.toLowerCase();
    return this.messages
      .filter(m => `${m.subject} ${m.body} ${m.from}`.toLowerCase().includes(q))
      .slice(0, limit)
      .map(m => this.safe(m));
  }
  async getMessage(id: string) {
    this.auth();
    const m = this.messages.find(x => x.id === id);
    if (!m) throw new Error("message_not_found");
    return this.safe(m);
  }
  async getThread(id: string): Promise<GmailThread> {
    this.auth();
    const messages = this.messages
      .filter(m => m.threadId === id)
      .map(m => this.safe(m));
    if (!messages.length) throw new Error("message_not_found");
    return {
      id,
      messageIds: messages.map(m => m.id),
      subject: messages[0].subject,
      messages,
    };
  }
  async listLabels(): Promise<GmailLabel[]> {
    this.auth();
    return [{ id: "INBOX", name: "INBOX", type: "system" }];
  }
  async createDraft(input: { to: string[]; subject: string; body: string }) {
    this.auth();
    const draft: GmailDraft = {
      id: `draft_${nanoid(8)}`,
      threadId: null,
      ...input,
      createdAt: Date.now(),
      status: "draft",
    };
    this.drafts.push(draft);
    return draft;
  }
  async send(input: {
    to: string[];
    subject: string;
    body: string;
    idempotencyKey: string;
  }) {
    this.auth();
    if (this.sent.has(input.idempotencyKey)) throw new Error("duplicate_send");
    this.sent.add(input.idempotencyKey);
    return { providerMessageId: `sent_${nanoid(8)}`, sentAt: Date.now() };
  }
}
