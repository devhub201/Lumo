import { describe, expect, it } from "vitest";
import { PermissionManager } from "../security/permissions";
import { createCodeWorkspace } from "./workspace";
import { browserActionSchema, browserUrlSchema } from "../browser/contracts";
import { BrowserWorkspace } from "../browser/workspace";
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
    const workspace = createCodeWorkspace(permissions);
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
    expect(result.error?.code).toBe("unsupported_operation");
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
});
