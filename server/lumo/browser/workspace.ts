import { nanoid } from "nanoid";
import type { PermissionManager } from "../security/permissions";
import {
  looksLikeInstructionInjection,
  sanitizePublicText,
  untrustedDataBoundary,
} from "../security/safety";
import {
  browserActionSchema,
  browserUrlSchema,
  type BrowserAction,
  type BrowserPage,
  type BrowserProvider,
  type BrowserResult,
  type BrowserSession,
  type BrowserSnapshot,
} from "./contracts";
const MAX_TEXT = 12000;
const strip = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
export class BrowserWorkspace {
  private sessions = new Map<string, BrowserSession>();
  private pages = new Map<string, BrowserPage>();
  private snapshots = new Map<string, BrowserSnapshot>();
  constructor(
    private readonly permissions: PermissionManager,
    private readonly provider: BrowserProvider = {
      fetch: async url => {
        const response = await fetch(url, { redirect: "manual" });
        return {
          status: response.status,
          body: (await response.text()).slice(0, 200_000),
        };
      },
    }
  ) {}
  createSession(ownerKey: string): BrowserSession {
    const session: BrowserSession = {
      id: `browser_${nanoid(10)}`,
      ownerKey,
      pages: [],
      activePageId: null,
      createdAt: Date.now(),
      permissionState: this.permissions.evaluate(ownerKey, "web_access").allowed
        ? "granted"
        : ("unknown" as const),
    };
    this.sessions.set(session.id, session);
    return session;
  }
  private session(id: string) {
    const value = this.sessions.get(id);
    if (!value) throw new Error("Browser session unavailable.");
    return value;
  }
  private check(owner: string) {
    if (!this.permissions.evaluate(owner, "web_access").allowed)
      throw new Error("Browser web permission denied.");
  }
  async open(ownerKey: string, sessionId: string, url: string) {
    this.check(ownerKey);
    const safe = browserUrlSchema.parse(url);
    const session = this.session(sessionId);
    if (session.ownerKey !== ownerKey)
      throw new Error("Browser session ownership mismatch.");
    const page: BrowserPage = {
      id: `page_${nanoid(10)}`,
      sessionId,
      url: safe,
      title: "",
      navigationState: "loading",
      createdAt: Date.now(),
    };
    this.pages.set(page.id, page);
    session.pages.push(page.id);
    session.activePageId = page.id;
    const snapshot = await this.fetchPage(page);
    page.title = snapshot.title;
    page.navigationState = "ready";
    this.snapshots.set(page.id, snapshot);
    return { page, snapshot };
  }
  private async fetchPage(page: BrowserPage): Promise<BrowserSnapshot> {
    try {
      const response = await this.provider.fetch(page.url);
      if (response.status >= 300 && response.status < 400)
        throw new Error("Redirects require explicit navigation.");
      if (response.status < 200 || response.status >= 300)
        throw new Error("Page navigation failed.");
      const html = response.body;
      const title =
        html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() || page.url;
      const text = sanitizePublicText(strip(html)).slice(0, MAX_TEXT);
      const links = [
        ...html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi),
      ]
        .slice(0, 50)
        .map(match => ({
          text: strip(match[2]).slice(0, 200),
          url: new URL(match[1], page.url).toString(),
        }));
      return {
        pageId: page.id,
        url: page.url,
        title: sanitizePublicText(title),
        text,
        links,
        timestamp: Date.now(),
        contentTrust: "untrusted_web_data",
      };
    } catch (error) {
      page.navigationState = "error";
      throw new Error(
        error instanceof Error ? error.message : "Browser unavailable."
      );
    }
  }
  async snapshot(
    ownerKey: string,
    sessionId: string
  ): Promise<BrowserSnapshot> {
    this.check(ownerKey);
    const session = this.session(sessionId);
    if (!session.activePageId) throw new Error("No active browser page.");
    const snapshot = this.snapshots.get(session.activePageId);
    if (!snapshot) throw new Error("Page snapshot unavailable.");
    return { ...snapshot, text: untrustedDataBoundary(snapshot.text) };
  }
  async action(
    ownerKey: string,
    sessionId: string,
    action: BrowserAction
  ): Promise<BrowserResult> {
    this.check(ownerKey);
    browserActionSchema.parse(action);
    if (action.type === "navigate") {
      if (!action.value) throw new Error("Navigation URL is required.");
      const opened = await this.open(ownerKey, sessionId, action.value);
      return { success: true, actionId: action.id, data: opened.snapshot };
    }
    if (["click", "select", "type"].includes(action.type))
      return {
        success: false,
        actionId: action.id,
        data: null,
        error: {
          code: "unsupported_operation",
          message:
            "Interactive side effects require a future controlled browser provider.",
        },
      };
    return {
      success: true,
      actionId: action.id,
      data: await this.snapshot(ownerKey, sessionId),
    };
  }
}
