import { describe, expect, it } from "vitest";
import { PermissionManager } from "./security/permissions";
import { MockGithubProvider, GithubManager } from "./github";
import { GmailManager, MockGmailProvider } from "./gmail";
import { sanitizePublicText } from "./security/safety";
import {
  InMemorySensitiveGrantStore,
  SensitiveGrantService,
} from "./security/grants";

describe("integration secret safety", () => {
  it("redacts provider token-like values before public context", () => {
    const value = sanitizePublicText(
      "ghp_123456789012345678901234567890 and ya29.abcdefghijklmnopqrstuvwxyz"
    );
    expect(value).toBe("[redacted] and [redacted]");
  });
});

describe("Phase 24 GitHub integration", () => {
  it("is disconnected by default and does not fake authorization", async () => {
    const permissions = new PermissionManager();
    permissions.grant("peter", "external_integrations");
    const provider = new MockGithubProvider();
    const manager = new GithubManager(permissions, provider);
    expect((await manager.account("peter")).data?.authState).toBe(
      "disconnected"
    );
    expect((await manager.listRepositories("peter")).error?.code).toBe(
      "authorization_required"
    );
  });
  it("lists, reads untrusted files, detects SHA conflicts and gates writes", async () => {
    const permissions = new PermissionManager();
    permissions.grant("peter", "external_integrations");
    const provider = new MockGithubProvider();
    provider.connect();
    const grants = new SensitiveGrantService(new InMemorySensitiveGrantStore());
    const manager = new GithubManager(permissions, provider, grants);
    const listed = await manager.listRepositories("peter");
    expect(listed.data).toHaveLength(1);
    const file = await manager.readFile("peter", {
      owner: "mock-owner",
      name: "mock-repository",
      branch: "main",
      path: "README.md",
    });
    expect(file.data?.contentTrust).toBe("untrusted_external_data");
    expect(file.data?.content).toContain("Untrusted external data");
    expect(
      (
        await manager.updateFile(
          "peter",
          {
            owner: "mock-owner",
            name: "mock-repository",
            branch: "main",
            path: "README.md",
            content: "changed",
            expectedSha: "wrong",
            message: "update",
          },
          await grants.issue(
            "peter",
            "github.update_file",
            "mock-owner/mock-repository/main/README.md"
          )
        )
      ).error?.code
    ).toBe("conflict");
    expect(
      (
        await manager.updateFile("peter", {
          owner: "mock-owner",
          name: "mock-repository",
          branch: "main",
          path: "README.md",
          content: "changed",
          expectedSha: null,
          message: "update",
        })
      ).error?.code
    ).toBe("authorization_required");
  });
});

describe("Phase 25 Gmail integration", () => {
  it("requires account permission and remains disconnected until provider connection", async () => {
    const permissions = new PermissionManager();
    const provider = new MockGmailProvider();
    const manager = new GmailManager(permissions, provider);
    expect((await manager.account("peter")).error?.code).toBe(
      "permission_denied"
    );
    permissions.grant("peter", "account_services");
    expect((await manager.list("peter")).error?.code).toBe(
      "authorization_required"
    );
    provider.connect();
    expect((await manager.search("peter", "mock")).data).toHaveLength(1);
  });
  it("keeps drafts separate from explicitly authorized, idempotent sending", async () => {
    const permissions = new PermissionManager();
    permissions.grant("peter", "account_services");
    const provider = new MockGmailProvider();
    provider.connect();
    const grants = new SensitiveGrantService(new InMemorySensitiveGrantStore());
    const manager = new GmailManager(permissions, provider, grants);
    expect(
      (
        await manager.draft("peter", {
          to: ["person@example.com"],
          subject: "Hello",
          body: "Draft",
        })
      ).success
    ).toBe(true);
    const input = {
      to: ["person@example.com"],
      subject: "Hello",
      body: "Send",
      idempotencyKey: "send-1",
    };
    expect((await manager.send("peter", input)).error?.code).toBe(
      "authorization_required"
    );
    const auth = await grants.issue("peter", "gmail.send", input.idempotencyKey);
    expect((await manager.send("peter", input, auth)).success).toBe(true);
    const replay = await manager.send("peter", input, auth);
    expect(replay.error?.code).toBe("authorization_required");
    const duplicateAuth = await grants.issue(
      "peter",
      "gmail.send",
      input.idempotencyKey
    );
    expect((await manager.send("peter", input, duplicateAuth)).error?.code).toBe(
      "duplicate_send"
    );
    const invalidAuth = await grants.issue("peter", "gmail.send", input.idempotencyKey);
    expect(
      (await manager.send("peter", { ...input, to: ["not-an-email"] }, invalidAuth))
        .error?.code
    ).toBe("invalid_input");
  });
});
