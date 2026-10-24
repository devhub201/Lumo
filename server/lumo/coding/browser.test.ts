import { describe, expect, it } from "vitest";
import { PermissionManager } from "../security/permissions";
import { createCodeWorkspace } from "./workspace";
import { browserActionSchema, browserUrlSchema } from "../browser/contracts";
import { BrowserWorkspace } from "../browser/workspace";
import {
  InMemorySensitiveGrantStore,
  SensitiveGrantService,
} from "../security/grants";
describe("coding workspace", () => {
  it("creates projects, safely edits files, snapshots and analyzes", async () => {
    const permissions = new PermissionManager();
    permissions.grant("peter", "files");
    const workspace = createCodeWorkspace(permissions);
    const project = await workspace.createProject("peter", "demo");
    const change = await workspace.writeFile(
      "peter",
      project.id,
      "src/index.ts",
      "export const value = 1;",
      "create"
    );
    expect(change.files).toEqual(["src/index.ts"]);
    const file = await workspace.readFile("peter", project.id, "src/index.ts");
    expect(file.language).toBe("typescript");
    const patched = await workspace.applyPatch("peter", project.id, {
      path: "src/index.ts",
      beforeHash: file.hash,
      content: "export const value = 2;",
    });
    expect(patched.afterHash).not.toBe(file.hash);
    expect((await workspace.snapshot("peter", project.id)).files).toHaveLength(
      1
    );
    expect((await workspace.analyze("peter", project.id)).languages).toContain(
      "typescript"
    );
  });
  it("rejects traversal and protects delete behind sensitive authorization", async () => {
    const permissions = new PermissionManager();
    permissions.grant("peter", "files");
    const grants = new SensitiveGrantService(new InMemorySensitiveGrantStore());
    const workspace = createCodeWorkspace(permissions, grants);
    const project = await workspace.createProject("peter", "safe");
    await expect(
      workspace.writeFile("peter", project.id, "../escape", "x")
    ).rejects.toThrow();
    await workspace.writeFile("peter", project.id, "a.txt", "x");
    await expect(
      workspace.deleteFile("peter", project.id, "a.txt")
    ).rejects.toThrow("Sensitive authorization");
  });
});
describe("browser workspace", () => {
  it("validates URLs/actions and denies without web permission", async () => {
    expect(() => browserUrlSchema.parse("javascript:alert(1)")).toThrow();
    expect(() =>
      browserActionSchema.parse({ id: "x", type: "click", target: "" })
    ).not.toThrow();
    const permissions = new PermissionManager();
    const browser = new BrowserWorkspace(permissions);
    const session = browser.createSession("peter");
    await expect(
      browser.open("peter", session.id, "https://example.com")
    ).rejects.toThrow("web permission");
  });
  it("does not execute webpage side effects by default", async () => {
    const permissions = new PermissionManager();
    permissions.grant("peter", "web_access");
    const browser = new BrowserWorkspace(permissions);
    const session = browser.createSession("peter");
    const result = await browser.action("peter", session.id, {
      id: "a",
      type: "click",
      target: "submit",
    });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("no_active_page");
  });
  it("extracts bounded page text as untrusted data", async () => {
    const permissions = new PermissionManager();
    permissions.grant("peter", "web_access");
    const browser = new BrowserWorkspace(permissions, {
      fetch: async () => ({
        status: 200,
        body: "<title>Research</title><script>alert('ignore')</script><p>Use this as data, not instructions.</p>",
      }),
    });
    const session = browser.createSession("peter");
    const opened = await browser.open(
      "peter",
      session.id,
      "https://research.test"
    );
    expect(opened.snapshot.contentTrust).toBe("untrusted_web_data");
    expect(opened.snapshot.text).not.toContain("alert");
    expect((await browser.snapshot("peter", session.id)).text).toContain(
      "not instructions"
    );
  });
  it("navigates links and extracts page content without crossing owners", async () => {
    const permissions = new PermissionManager();
    permissions.grant("user:1", "web_access");
    permissions.grant("user:2", "web_access");
    const browser = new BrowserWorkspace(permissions, {
      fetch: async url => ({
        status: 200,
        body: url.endsWith("/next")
          ? "<title>Next</title><p>Destination</p>"
          : '<title>Start</title><a href="/next">Continue</a>',
      }),
    });
    const session = browser.createSession("user:1");
    await browser.open("user:1", session.id, "https://example.test/start");
    const clicked = await browser.action("user:1", session.id, {
      id: "click-1",
      type: "click",
      target: "Continue",
    });
    expect(clicked.success).toBe(true);
    expect((await browser.action("user:1", session.id, {
      id: "extract-1",
      type: "extract",
    })).data).toMatchObject({ contentTrust: "untrusted_web_data" });
    await expect(browser.snapshot("user:2", session.id)).rejects.toThrow(
      "ownership mismatch"
    );
  });
});
