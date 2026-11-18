import { chromium, type Browser, type Page } from "playwright";
import { sanitizePublicText } from "../security/safety";

const MAX_TEXT = 12000;

export type InteractiveSnapshot = {
  url: string;
  title: string;
  html: string;
};

/**
 * A genuine, interactive browser session — launches real Chromium and
 * drives it (navigate, click, type, select, scroll). This is what makes
 * "log in on your behalf" possible, instead of the plain-fetch provider
 * which can only read a page, never act on it.
 *
 * Sandboxed means isolated from Peter's own Chrome (its own browser
 * context, its own cookie jar, torn down when he ends the session) — it
 * does not mean fake. Every action here actually happens in a real page.
 */
export class PlaywrightBrowserProvider {
  private browserPromise: Promise<Browser> | null = null;
  private pages = new Map<string, Page>();

  private async browser(): Promise<Browser> {
    if (!this.browserPromise) {
      this.browserPromise = chromium.launch({ headless: true });
    }
    return this.browserPromise;
  }

  /** Plain read, kept for providers/snapshot callers that only need HTML. */
  async fetch(url: string) {
    const page = await this.pageFor(`anon_${url}`, { fresh: true });
    const response = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 20000,
    });
    const body = await page.content();
    await page.close();
    this.pages.delete(`anon_${url}`);
    return { status: response?.status() ?? 200, body: body.slice(0, 200_000) };
  }

  private async pageFor(pageId: string, opts: { fresh?: boolean } = {}) {
    if (!opts.fresh && this.pages.has(pageId)) return this.pages.get(pageId)!;
    const browser = await this.browser();
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) LumoBrowser/1.0 (real, sandboxed)",
    });
    const page = await context.newPage();
    this.pages.set(pageId, page);
    return page;
  }

  async navigate(pageId: string, url: string): Promise<InteractiveSnapshot> {
    const page = await this.pageFor(pageId);
    const response = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 25000,
    });
    if (!response || response.status() >= 400)
      throw new Error(`Navigation failed with status ${response?.status() ?? "unknown"}.`);
    return this.describe(page);
  }

  async click(pageId: string, selectorOrText: string): Promise<InteractiveSnapshot> {
    const page = this.pages.get(pageId);
    if (!page) throw new Error("Browser page is not open.");
    await this.locate(page, selectorOrText).click({ timeout: 8000 });
    await page.waitForLoadState("domcontentloaded", { timeout: 8000 }).catch(() => {});
    return this.describe(page);
  }

  async type(
    pageId: string,
    selectorOrText: string,
    value: string
  ): Promise<InteractiveSnapshot> {
    const page = this.pages.get(pageId);
    if (!page) throw new Error("Browser page is not open.");
    const field = this.locate(page, selectorOrText);
    await field.click({ timeout: 8000 });
    await field.fill("");
    await field.type(value, { delay: 12 });
    return this.describe(page);
  }

  async select(
    pageId: string,
    selectorOrText: string,
    value: string
  ): Promise<InteractiveSnapshot> {
    const page = this.pages.get(pageId);
    if (!page) throw new Error("Browser page is not open.");
    await this.locate(page, selectorOrText).selectOption(value, { timeout: 8000 });
    return this.describe(page);
  }

  async scroll(pageId: string, deltaY: number): Promise<InteractiveSnapshot> {
    const page = this.pages.get(pageId);
    if (!page) throw new Error("Browser page is not open.");
    await page.mouse.wheel(0, deltaY);
    return this.describe(page);
  }

  async describe(page: Page): Promise<InteractiveSnapshot> {
    return {
      url: page.url(),
      title: await page.title(),
      html: await page.content(),
    };
  }

  /**
   * A selector only if it's unambiguously CSS-shaped (leading .#[ or a tag
   * name immediately followed by a combinator/attribute, e.g. "button.primary",
   * "input[name=email]"). A bare word or phrase like "Username" or "Log in"
   * — which also happens to match a tag-name-only pattern — must NOT be
   * treated as a selector, or Playwright looks for a literal <username> or
   * <log><in> element and the real text target is never found.
   */
  private locate(page: Page, target: string) {
    const trimmed = target.trim();
    const looksLikeSelector =
      /^[.#\[]/.test(trimmed) || /^[a-z][a-z0-9-]*\s*(\[|>|~|\+|:)/i.test(trimmed);
    if (looksLikeSelector) {
      try {
        return page.locator(target).first();
      } catch {
        // fall through to text-based lookup
      }
    }
    return page
      .getByRole("button", { name: target, exact: false })
      .or(page.getByRole("link", { name: target, exact: false }))
      .or(page.getByLabel(target, { exact: false }))
      .or(page.getByPlaceholder(target, { exact: false }))
      .or(page.getByText(target, { exact: false }))
      .first();
  }

  async closePage(pageId: string) {
    const page = this.pages.get(pageId);
    if (!page) return;
    await page.context().close().catch(() => {});
    this.pages.delete(pageId);
  }

  async dispose() {
    for (const id of this.pages.keys()) await this.closePage(id);
    const browser = await this.browserPromise;
    await browser?.close();
    this.browserPromise = null;
  }
}

export const extractSnapshotParts = (html: string, baseUrl: string) => {
  const title =
    html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() || baseUrl;
  const text = sanitizePublicText(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim()
  ).slice(0, MAX_TEXT);
  const links = [
    ...html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi),
  ]
    .slice(0, 50)
    .map(match => {
      try {
        return {
          text: sanitizePublicText(
            match[2].replace(/<[^>]+>/g, " ").trim()
          ).slice(0, 200),
          url: new URL(match[1], baseUrl).toString(),
        };
      } catch {
        return null;
      }
    })
    .filter((link): link is { text: string; url: string } => Boolean(link));
  return { title: sanitizePublicText(title), text, links };
};
