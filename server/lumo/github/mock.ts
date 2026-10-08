import { createHash } from "node:crypto";
import type {
  GithubAccount,
  GithubBranch,
  GithubChange,
  GithubCommit,
  GithubFile,
  GithubIssue,
  GithubProvider,
  GithubPullRequest,
  GithubRepository,
} from "./contracts";
import { untrustedDataBoundary } from "../security/safety";
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
export class MockGithubProvider implements GithubProvider {
  private connected = false;
  private files = new Map<string, { content: string; sha: string }>();
  private branches = new Map<string, GithubBranch[]>();
  private commits: GithubCommit[] = [];
  private prs: GithubPullRequest[] = [];
  private issues: GithubIssue[] = [];
  readonly repository: GithubRepository = {
    id: "repo_mock_lumo",
    owner: "mock-owner",
    name: "mock-repository",
    fullName: "mock-owner/mock-repository",
    defaultBranch: "main",
    private: true,
    updatedAt: Date.now(),
  };
  constructor() {
    this.files.set("main:README.md", {
      content: "Mock repository content.",
      sha: sha("Mock repository content."),
    });
    this.branches.set("mock-owner/mock-repository", [
      { name: "main", sha: sha("main"), protected: true },
    ]);
  }
  connect() {
    this.connected = true;
  }
  disconnect() {
    this.connected = false;
  }
  private auth() {
    if (!this.connected) throw new Error("authorization_required");
  }
  async getAccount(): Promise<GithubAccount> {
    return {
      id: "github_mock_account",
      login: "mock-owner",
      name: "Mock GitHub Account",
      authState: this.connected ? "connected" : "disconnected",
      scopes: this.connected ? ["repo", "pull_requests", "issues"] : [],
      connectedAt: this.connected ? Date.now() : null,
    };
  }
  async listRepositories() {
    this.auth();
    return [this.repository];
  }
  async inspectRepository(owner: string, name: string) {
    this.auth();
    if (owner !== this.repository.owner || name !== this.repository.name)
      throw new Error("repository_not_found");
    return this.repository;
  }
  async listBranches(owner: string, name: string) {
    await this.inspectRepository(owner, name);
    return this.branches.get(`${owner}/${name}`) ?? [];
  }
  async readFile(
    owner: string,
    name: string,
    branch: string,
    path: string
  ): Promise<GithubFile> {
    await this.inspectRepository(owner, name);
    if (branch !== "main") throw new Error("branch_not_found");
    const item = this.files.get(`${branch}:${path}`);
    if (!item) throw new Error("file_not_found");
    return {
      path,
      sha: item.sha,
      size: Buffer.byteLength(item.content),
      content: untrustedDataBoundary(item.content),
      encoding: "utf8",
      contentTrust: "untrusted_external_data",
    };
  }
  async createBranch(
    owner: string,
    name: string,
    branch: string,
    fromSha: string
  ) {
    await this.inspectRepository(owner, name);
    const list = this.branches.get(`${owner}/${name}`) ?? [];
    if (list.some(b => b.name === branch)) throw new Error("branch_exists");
    const value = { name: branch, sha: fromSha, protected: false };
    list.push(value);
    this.branches.set(`${owner}/${name}`, list);
    return value;
  }
  async updateFile(input: {
    owner: string;
    name: string;
    branch: string;
    path: string;
    content: string;
    expectedSha: string | null;
    message: string;
  }): Promise<GithubChange> {
    await this.inspectRepository(input.owner, input.name);
    const key = `${input.branch}:${input.path}`;
    const old = this.files.get(key);
    if ((old?.sha ?? null) !== input.expectedSha) throw new Error("conflict");
    const afterSha = sha(input.content);
    this.files.set(key, { content: input.content, sha: afterSha });
    return {
      path: input.path,
      beforeSha: old?.sha ?? null,
      afterSha,
      content: input.content,
    };
  }
  async createCommit(input: {
    owner: string;
    name: string;
    branch: string;
    message: string;
    changes: GithubChange[];
  }) {
    await this.inspectRepository(input.owner, input.name);
    const commit = {
      sha: sha(`${Date.now()}:${input.message}`),
      message: input.message,
      branch: input.branch,
      changedFiles: input.changes.map(c => c.path),
      createdAt: Date.now(),
    };
    this.commits.push(commit);
    return commit;
  }
  async listPullRequests(owner: string, name: string) {
    await this.inspectRepository(owner, name);
    return this.prs.map(pr => ({
      ...pr,
      description: untrustedDataBoundary(pr.description),
    }));
  }
  async createPullRequest(input: Omit<GithubPullRequest, "number" | "status">) {
    await this.inspectRepository(this.repository.owner, this.repository.name);
    const pr = {
      ...input,
      number: this.prs.length + 1,
      status: "open" as const,
    };
    this.prs.push(pr);
    return pr;
  }
  async listIssues(owner: string, name: string) {
    await this.inspectRepository(owner, name);
    return this.issues.map(issue => ({
      ...issue,
      body: untrustedDataBoundary(issue.body),
    }));
  }
  async createIssue(input: {
    owner: string;
    name: string;
    title: string;
    body: string;
  }) {
    await this.inspectRepository(input.owner, input.name);
    const issue = {
      number: this.issues.length + 1,
      title: untrustedDataBoundary(input.title),
      body: untrustedDataBoundary(input.body),
      state: "open" as const,
      createdAt: Date.now(),
    };
    this.issues.push(issue);
    return issue;
  }
}
