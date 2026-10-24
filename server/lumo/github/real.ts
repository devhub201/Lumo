import { untrustedDataBoundary } from "../security/safety";
import { OAuthFoundationService, type OAuthPersistence } from "../oauth/storage";
import type { OAuthTokenCipher } from "../oauth/crypto";
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

const API = "https://api.github.com";
const TOKEN_URL = "https://github.com/login/oauth/access_token";
const API_VERSION = "2026-03-10";
const USER_AGENT = "LUMO-GitHub";

type Fetcher = typeof fetch;
type GithubConfig = {
  clientId: string;
  clientSecret: string;
};

type GithubErrorBody = { message?: unknown };

const stringValue = (value: unknown) =>
  typeof value === "string" ? value : "";
const timestamp = (value: unknown) => {
  const time = typeof value === "string" ? Date.parse(value) : NaN;
  return Number.isFinite(time) ? time : Date.now();
};
const safeJson = async (response: Response) => {
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
};

export class RealGithubProvider implements GithubProvider {
  constructor(
    private readonly ownerKey: string,
    private readonly persistence: OAuthPersistence,
    private readonly cipher: OAuthTokenCipher,
    private readonly config: GithubConfig,
    private readonly fetchImpl: Fetcher = fetch,
    private readonly now: () => Date = () => new Date()
  ) {}

  async getAccount(): Promise<GithubAccount> {
    const connection = await this.connection();
    return {
      id: connection.providerAccountId,
      login: connection.providerLogin ?? "",
      name: null,
      authState: connection.state === "error" ? "expired" : connection.state,
      scopes: connection.scopes,
      connectedAt: connection.lastValidatedAt?.getTime() ?? null,
    };
  }

  async listRepositories(): Promise<GithubRepository[]> {
    const rows = await this.api<unknown[]>("/user/repos?per_page=100&sort=updated");
    return rows.map(row => {
      const item = row as Record<string, unknown>;
      const owner = item.owner as Record<string, unknown> | undefined;
      return {
        id: String(item.id ?? ""),
        owner: stringValue(owner?.login),
        name: stringValue(item.name),
        fullName: stringValue(item.full_name),
        defaultBranch: stringValue(item.default_branch) || "main",
        private: item.private === true,
        updatedAt: timestamp(item.updated_at),
      };
    });
  }

  async inspectRepository(owner: string, name: string): Promise<GithubRepository> {
    const item = (await this.api(`/repos/${this.segment(owner)}/${this.segment(name)}`)) as Record<string, unknown>;
    const account = item.owner as Record<string, unknown> | undefined;
    return {
      id: String(item.id ?? ""),
      owner: stringValue(account?.login) || owner,
      name: stringValue(item.name) || name,
      fullName: stringValue(item.full_name) || `${owner}/${name}`,
      defaultBranch: stringValue(item.default_branch) || "main",
      private: item.private === true,
      updatedAt: timestamp(item.updated_at),
    };
  }

  async listBranches(owner: string, name: string): Promise<GithubBranch[]> {
    const rows = await this.api<unknown[]>(`/repos/${this.segment(owner)}/${this.segment(name)}/branches?per_page=100`);
    return rows.map(row => {
      const item = row as Record<string, unknown>;
      const commit = item.commit as Record<string, unknown> | undefined;
      return {
        name: stringValue(item.name),
        sha: stringValue(commit?.sha),
        protected: item.protected === true,
      };
    });
  }

  async readFile(owner: string, name: string, branch: string, path: string): Promise<GithubFile> {
    const item = (await this.api(`/repos/${this.segment(owner)}/${this.segment(name)}/contents/${this.path(path)}?ref=${encodeURIComponent(branch)}`)) as Record<string, unknown>;
    const raw = stringValue(item.content).replace(/\s/g, "");
    let content = "";
    try {
      content = Buffer.from(raw, "base64").toString("utf8");
    } catch {
      throw new Error("provider_failed");
    }
    return {
      path,
      sha: stringValue(item.sha),
      size: Number(item.size ?? Buffer.byteLength(content)),
      content: untrustedDataBoundary(content),
      encoding: "utf8",
      contentTrust: "untrusted_external_data",
    };
  }

  async createBranch(owner: string, name: string, branch: string, fromSha: string): Promise<GithubBranch> {
    const result = (await this.api(`/repos/${this.segment(owner)}/${this.segment(name)}/git/refs`, {
      method: "POST",
      body: { ref: `refs/heads/${branch}`, sha: fromSha },
    })) as Record<string, unknown>;
    return { name: branch, sha: stringValue(result.object && (result.object as Record<string, unknown>).sha) || fromSha, protected: false };
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
    const result = (await this.api(`/repos/${this.segment(input.owner)}/${this.segment(input.name)}/contents/${this.path(input.path)}`, {
      method: "PUT",
      body: {
        message: input.message,
        content: Buffer.from(input.content, "utf8").toString("base64"),
        branch: input.branch,
        ...(input.expectedSha ? { sha: input.expectedSha } : {}),
      },
    })) as Record<string, unknown>;
    const content = result.content as Record<string, unknown> | undefined;
    const commit = result.commit as Record<string, unknown> | undefined;
    return {
      path: input.path,
      beforeSha: input.expectedSha,
      afterSha: stringValue(content?.sha),
      content: input.content,
    };
  }

  async createCommit(input: {
    owner: string;
    name: string;
    branch: string;
    message: string;
    changes: GithubChange[];
  }): Promise<GithubCommit> {
    let sha = "";
    for (const change of input.changes) {
      const result = await this.updateFile({
        owner: input.owner,
        name: input.name,
        branch: input.branch,
        path: change.path,
        content: change.content,
        expectedSha: change.beforeSha,
        message: input.message,
      });
      sha = result.afterSha;
    }
    return {
      sha,
      message: untrustedDataBoundary(input.message),
      branch: input.branch,
      changedFiles: input.changes.map(change => change.path),
      createdAt: this.now().getTime(),
    };
  }

  async listPullRequests(owner: string, name: string): Promise<GithubPullRequest[]> {
    const rows = await this.api<unknown[]>(`/repos/${this.segment(owner)}/${this.segment(name)}/pulls?state=all&per_page=100`);
    return rows.map(row => this.pullRequest(row));
  }

  async createPullRequest(input: Omit<GithubPullRequest, "number" | "status">): Promise<GithubPullRequest> {
    const pullInput = input as Omit<GithubPullRequest, "number" | "status"> & {
      owner: string;
      name: string;
    };
    const row = await this.api(`/repos/${this.segment(pullInput.owner)}/${this.segment(pullInput.name)}/pulls`, {
      method: "POST",
      body: {
        title: pullInput.title,
        body: pullInput.description,
        head: pullInput.sourceBranch,
        base: pullInput.targetBranch,
      },
    });
    return this.pullRequest(row);
  }

  async listIssues(owner: string, name: string): Promise<GithubIssue[]> {
    const rows = await this.api<unknown[]>(`/repos/${this.segment(owner)}/${this.segment(name)}/issues?state=all&per_page=100`);
    return rows.filter(row => !(row as Record<string, unknown>).pull_request).map(row => {
      const item = row as Record<string, unknown>;
      return {
        number: Number(item.number ?? 0),
        title: untrustedDataBoundary(stringValue(item.title)),
        body: untrustedDataBoundary(stringValue(item.body)),
        state: item.state === "closed" ? "closed" : "open",
        createdAt: timestamp(item.created_at),
      };
    });
  }

  async createIssue(input: { owner: string; name: string; title: string; body: string }): Promise<GithubIssue> {
    const row = (await this.api(`/repos/${this.segment(input.owner)}/${this.segment(input.name)}/issues`, {
      method: "POST",
      body: { title: input.title, body: input.body },
    })) as Record<string, unknown>;
    return {
      number: Number(row.number ?? 0),
      title: untrustedDataBoundary(stringValue(row.title)),
      body: untrustedDataBoundary(stringValue(row.body)),
      state: row.state === "closed" ? "closed" : "open",
      createdAt: timestamp(row.created_at),
    };
  }

  private async connection() {
    const connection = await this.persistence.getConnection(this.ownerKey, "github");
    if (!connection || connection.state === "revoked" || connection.state === "expired" || connection.state === "error")
      throw new Error("authorization_required");
    return connection;
  }

  private async accessToken() {
    let connection = await this.connection();
    if (
      connection.accessTokenExpiresAt &&
      connection.accessTokenExpiresAt.getTime() <= this.now().getTime() + 60_000
    ) {
      if (!connection.refreshTokenCiphertext) {
        await this.persistence.setConnectionState(this.ownerKey, "github", "expired");
        throw new Error("token_expired");
      }
      let refreshToken: string;
      try {
        refreshToken = this.cipher.decrypt(connection.refreshTokenCiphertext);
      } catch {
        await this.persistence.setConnectionState(this.ownerKey, "github", "expired");
        throw new Error("token_expired");
      }
      const response = await this.fetchImpl(TOKEN_URL, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json", "User-Agent": USER_AGENT },
        body: JSON.stringify({
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          grant_type: "refresh_token",
          refresh_token: refreshToken,
        }),
      });
      const body = (await safeJson(response)) as Record<string, unknown> | null;
      const accessToken = stringValue(body?.access_token);
      if (!response.ok || !accessToken) {
        await this.persistence.setConnectionState(this.ownerKey, "github", "expired");
        throw new Error("token_expired");
      }
      const expiresIn = Number(body?.expires_in);
      const rotatedRefresh = stringValue(body?.refresh_token) || refreshToken;
      await new OAuthFoundationService(this.persistence, this.cipher, this.now).saveProviderTokens({
        ownerKey: this.ownerKey,
        provider: "github",
        providerAccountId: connection.providerAccountId,
        providerLogin: connection.providerLogin,
        accessToken,
        refreshToken: rotatedRefresh,
        accessTokenExpiresAt: Number.isSafeInteger(expiresIn) && expiresIn > 0
          ? new Date(this.now().getTime() + expiresIn * 1000)
          : null,
        scopes: connection.scopes,
      });
      connection = await this.connection();
    }
    try {
      return this.cipher.decrypt(connection.accessTokenCiphertext);
    } catch {
      await this.persistence.setConnectionState(this.ownerKey, "github", "expired");
      throw new Error("token_expired");
    }
  }

  private async api<T = unknown>(path: string, input: { method?: string; body?: unknown } = {}) {
    const token = await this.accessToken();
    const response = await this.fetchImpl(`${API}${path}`, {
      method: input.method ?? "GET",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": API_VERSION,
        "User-Agent": USER_AGENT,
      },
      ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
    });
    const body = await safeJson(response);
    if (response.status === 401) {
      await this.persistence.setConnectionState(this.ownerKey, "github", "expired");
      throw new Error("token_expired");
    }
    if (!response.ok) {
      const message = stringValue((body as GithubErrorBody | null)?.message).toLowerCase();
      throw new Error(message.includes("rate limit") ? "rate_limited" : "provider_unavailable");
    }
    return body as T;
  }

  private pullRequest(row: unknown): GithubPullRequest {
    const item = row as Record<string, unknown>;
    const head = item.head as Record<string, unknown> | undefined;
    const base = item.base as Record<string, unknown> | undefined;
    const headRepo = head?.repo as Record<string, unknown> | undefined;
    const baseRepo = base?.repo as Record<string, unknown> | undefined;
    return {
      number: Number(item.number ?? 0),
      title: untrustedDataBoundary(stringValue(item.title)),
      description: untrustedDataBoundary(stringValue(item.body)),
      sourceBranch: stringValue(head?.ref),
      targetBranch: stringValue(base?.ref),
      status: item.state === "closed" ? "closed" : "open",
      commitShas: [stringValue(head?.sha), stringValue(base?.sha)].filter(Boolean),
    };
  }

  private segment(value: string) {
    return encodeURIComponent(value);
  }

  private path(value: string) {
    return value.split("/").map(segment => encodeURIComponent(segment)).join("/");
  }
}
