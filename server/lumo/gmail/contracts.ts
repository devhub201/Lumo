import { z } from "zod";
export const gmailAuthStateSchema = z.enum([
  "disconnected",
  "connected",
  "expired",
  "revoked",
]);
export type GmailAuthState = z.infer<typeof gmailAuthStateSchema>;
export type GmailAccount = {
  id: string;
  email: string;
  displayName: string | null;
  authState: GmailAuthState;
  scopes: string[];
  connectedAt: number | null;
};
export type GmailAttachment = {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  contentAvailable: boolean;
};
export type GmailMessage = {
  id: string;
  threadId: string;
  from: string;
  to: string[];
  subject: string;
  body: string;
  receivedAt: number;
  labels: string[];
  attachments: GmailAttachment[];
  contentTrust: "untrusted_external_data";
};
export type GmailThread = {
  id: string;
  messageIds: string[];
  subject: string;
  messages: GmailMessage[];
};
export type GmailLabel = { id: string; name: string; type: "system" | "user" };
export type GmailDraft = {
  id: string;
  threadId: string | null;
  to: string[];
  subject: string;
  body: string;
  createdAt: number;
  status: "draft";
};
export type GmailOperation =
  | "list_messages"
  | "search_messages"
  | "inspect_message"
  | "inspect_thread"
  | "list_labels"
  | "attachment_metadata"
  | "create_draft"
  | "send";
export type GmailResult<T> = {
  success: boolean;
  operation: GmailOperation;
  data: T | null;
  error: { code: string; message: string; retryable: boolean } | null;
  requestId: string;
};
export type GmailProvider = {
  getAccount(): Promise<GmailAccount>;
  listMessages(limit: number): Promise<GmailMessage[]>;
  searchMessages(query: string, limit: number): Promise<GmailMessage[]>;
  getMessage(id: string): Promise<GmailMessage>;
  getThread(id: string): Promise<GmailThread>;
  listLabels(): Promise<GmailLabel[]>;
  createDraft(input: {
    to: string[];
    subject: string;
    body: string;
  }): Promise<GmailDraft>;
  send(input: {
    to: string[];
    subject: string;
    body: string;
    idempotencyKey: string;
  }): Promise<{ providerMessageId: string; sentAt: number }>;
};
