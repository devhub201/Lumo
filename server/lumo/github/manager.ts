import {
  requireSensitiveAuthorization,
  type SensitiveActionAuthorization,
} from "../security/safety";
import type { PermissionManager } from "../security/permissions";
import type {
  GithubChange,
  GithubOperation,
  GithubProvider,
  GithubResult,
  GithubAccount,
} from "./contracts";
import { nanoid } from "nanoid";
const ok = <T>(
  operation: GithubOperation,
  requestId: string,
  data: T
): GithubResult<T> => ({
  success: true,
  operation,
  data,
  error: null,
  requestId,
});
const fail = <T>(
  operation: GithubOperation,
  requestId: string,
  error: unknown
): GithubResult<T> => {
  const message =
    error instanceof Error ? error.message : "provider_unavailable";
  const code = message.split(" ")[0] || "provider_failed";
  return {
    success: false,
    operation,
    data: null,
    error: {
      code,
      message:
        code === "authorization_required"
          ? "GitHub authorization is required."
          : "GitHub operation failed.",
      retryable: [
        "rate_limited",
        "provider_unavailable",
        "token_expired",
      ].includes(code),
    },
    requestId,
  };
};
export class GithubManager {
  constructor(
    private readonly permissions: PermissionManager,
    private readonly provider: GithubProvider
  ) {}
  private allowed(owner: string) {
    if (!this.permissions.evaluate(owner, "external_integrations").allowed)
      throw new Error("permission_denied");
  }
  private sensitive(
    auth: SensitiveActionAuthorization | undefined,
    action: string
  ) {
    if (!requireSensitiveAuthorization(auth, action))
      throw new Error("authorization_required");
  }
  async account(owner: string, requestId = nanoid()) {
    try {
      this.allowed(owner);
      return ok(
        "list_repositories",
        requestId,
        await this.provider.getAccount()
      );
    } catch (e) {
      return fail<GithubAccount>("list_repositories", requestId, e);
    }
  }
  async listRepositories(owner: string, requestId = nanoid()) {
    try {
      this.allowed(owner);
      return ok(
        "list_repositories",
        requestId,
        await this.provider.listRepositories()
      );
    } catch (e) {
      return fail("list_repositories", requestId, e);
    }
  }
  async inspect(
    owner: string,
    repository: { owner: string; name: string },
    requestId = nanoid()
  ) {
    try {
      this.allowed(owner);
      return ok(
        "inspect_repository",
        requestId,
        await this.provider.inspectRepository(repository.owner, repository.name)
      );
    } catch (e) {
      return fail("inspect_repository", requestId, e);
    }
  }
  async branches(
    owner: string,
    repository: { owner: string; name: string },
    requestId = nanoid()
  ) {
    try {
      this.allowed(owner);
      return ok(
        "list_branches",
        requestId,
        await this.provider.listBranches(repository.owner, repository.name)
      );
    } catch (e) {
      return fail("list_branches", requestId, e);
    }
  }
  async readFile(
    owner: string,
    input: { owner: string; name: string; branch: string; path: string },
    requestId = nanoid()
  ) {
    try {
      this.allowed(owner);
      if (input.path.includes("..") || input.path.startsWith("/"))
        throw new Error("security_rejected");
      return ok(
        "read_file",
        requestId,
        await this.provider.readFile(
          input.owner,
          input.name,
          input.branch,
          input.path
        )
      );
    } catch (e) {
      return fail("read_file", requestId, e);
    }
  }
  async createBranch(
    owner: string,
    input: { owner: string; name: string; branch: string; fromSha: string },
    auth?: SensitiveActionAuthorization,
    requestId = nanoid()
  ) {
    try {
      this.allowed(owner);
      this.sensitive(auth, "github.create_branch");
      return ok(
        "create_branch",
        requestId,
        await this.provider.createBranch(
          input.owner,
          input.name,
          input.branch,
          input.fromSha
        )
      );
    } catch (e) {
      return fail("create_branch", requestId, e);
    }
  }
  async updateFile(
    owner: string,
    input: {
      owner: string;
      name: string;
      branch: string;
      path: string;
      content: string;
      expectedSha: string | null;
      message: string;
    },
    auth?: SensitiveActionAuthorization,
    requestId = nanoid()
  ) {
    try {
      this.allowed(owner);
      this.sensitive(auth, "github.update_file");
      if (input.path.includes("..") || input.path.startsWith("/"))
        throw new Error("security_rejected");
      return ok(
        "update_file",
        requestId,
        await this.provider.updateFile(input)
      );
    } catch (e) {
      return fail("update_file", requestId, e);
    }
  }
  async createCommit(
    owner: string,
    input: {
      owner: string;
      name: string;
      branch: string;
      message: string;
      changes: GithubChange[];
    },
    auth?: SensitiveActionAuthorization,
    requestId = nanoid()
  ) {
    try {
      this.allowed(owner);
      this.sensitive(auth, "github.create_commit");
      if (
        input.changes.some(c => c.path.includes("..") || c.path.startsWith("/"))
      )
        throw new Error("security_rejected");
      return ok(
        "create_commit",
        requestId,
        await this.provider.createCommit(input)
      );
    } catch (e) {
      return fail("create_commit", requestId, e);
    }
  }
  async pullRequests(
    owner: string,
    repository: { owner: string; name: string },
    requestId = nanoid()
  ) {
    try {
      this.allowed(owner);
      return ok(
        "pull_requests",
        requestId,
        await this.provider.listPullRequests(repository.owner, repository.name)
      );
    } catch (e) {
      return fail("pull_requests", requestId, e);
    }
  }
  async createPullRequest(
    owner: string,
    input: Parameters<GithubProvider["createPullRequest"]>[0],
    auth?: SensitiveActionAuthorization,
    requestId = nanoid()
  ) {
    try {
      this.allowed(owner);
      this.sensitive(auth, "github.create_pull_request");
      return ok(
        "create_pull_request",
        requestId,
        await this.provider.createPullRequest(input)
      );
    } catch (e) {
      return fail("create_pull_request", requestId, e);
    }
  }
  async issues(
    owner: string,
    repository: { owner: string; name: string },
    requestId = nanoid()
  ) {
    try {
      this.allowed(owner);
      return ok(
        "issues",
        requestId,
        await this.provider.listIssues(repository.owner, repository.name)
      );
    } catch (e) {
      return fail("issues", requestId, e);
    }
  }
  async createIssue(
    owner: string,
    input: { owner: string; name: string; title: string; body: string },
    auth?: SensitiveActionAuthorization,
    requestId = nanoid()
  ) {
    try {
      this.allowed(owner);
      this.sensitive(auth, "github.create_issue");
      return ok(
        "create_issue",
        requestId,
        await this.provider.createIssue(input)
      );
    } catch (e) {
      return fail("create_issue", requestId, e);
    }
  }
}
