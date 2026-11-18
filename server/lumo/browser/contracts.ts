import { z } from "zod";
export const browserPermissionSchema = z.enum([
  "web_access",
  "external_integrations",
  "sensitive_actions",
]);
export type BrowserPermission = z.infer<typeof browserPermissionSchema>;
export type BrowserPage = {
  id: string;
  sessionId: string;
  url: string;
  title: string;
  navigationState: "loading" | "ready" | "error";
  createdAt: number;
};
export type BrowserSession = {
  id: string;
  ownerKey: string;
  pages: string[];
  activePageId: string | null;
  createdAt: number;
  permissionState: "unknown" | "granted" | "denied";
};
export type BrowserNavigation = {
  actionId: string;
  from: string | null;
  to: string;
  timestamp: number;
  success: boolean;
};
export type BrowserAction = {
  id: string;
  type: "navigate" | "click" | "select" | "type" | "scroll" | "extract";
  target?: string;
  value?: string;
};
export type BrowserSnapshot = {
  pageId: string;
  url: string;
  title: string;
  text: string;
  links: Array<{ text: string; url: string }>;
  timestamp: number;
  contentTrust: "untrusted_web_data";
};
export type BrowserContent = {
  pageId: string;
  text: string;
  sourceUrl: string;
  truncated: boolean;
  contentTrust: "untrusted_web_data";
};
export type BrowserResult = {
  success: boolean;
  actionId: string;
  data: unknown;
  error?: { code: string; message: string };
};
export type BrowserProviderResponse = { status: number; body: string };
export type BrowserInteractionResult = { url: string; title: string; html: string };
export interface BrowserProvider {
  fetch(url: string): Promise<BrowserProviderResponse>;
  /**
   * Optional real-interactivity surface. A provider that implements these
   * (e.g. a Playwright-backed one) keeps one live page per pageId across
   * calls, so a click or typed value actually lands on the same session —
   * this is what makes logging in on the person's behalf possible. A
   * provider without these only supports navigate/extract via fetch().
   */
  navigate?(pageId: string, url: string): Promise<BrowserInteractionResult>;
  click?(pageId: string, target: string): Promise<BrowserInteractionResult>;
  type?(
    pageId: string,
    target: string,
    value: string
  ): Promise<BrowserInteractionResult>;
  select?(
    pageId: string,
    target: string,
    value: string
  ): Promise<BrowserInteractionResult>;
  scroll?(pageId: string, deltaY: number): Promise<BrowserInteractionResult>;
  closePage?(pageId: string): Promise<void>;
}
export const browserUrlSchema = z
  .string()
  .url()
  .refine(value => {
    const url = new URL(value);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      !/[\u0000-\u001f]/.test(value)
    );
  }, "Only safe HTTP(S) URLs are supported");
export const browserActionSchema = z.object({
  id: z.string().min(1).max(80),
  type: z.enum(["navigate", "click", "select", "type", "scroll", "extract"]),
  target: z.string().max(300).optional(),
  value: z.string().max(2000).optional(),
});
