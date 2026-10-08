import { z } from "zod";

export const githubAuthStateSchema = z.enum([
  "disconnected",
  "connected",
  "expired",
  "revoked",
]);
export type GithubAuthState = z.infer<typeof githubAuthStateSchema>;
export const githubOperationSchema = z.enum([
  "list_repositories",
  "inspect_repository",
  "list_branches",
  "read_file",
  "tree",
  "diff",
  "commits",
  "create_branch",
  "update_file",
  "create_commit",
  "pull_requests",
  "create_pull_request",
  "issues",
  "create_issue",
]);
export type GithubOperation = z.infer<typeof githubOperationSchema>;
export type GithubAccount = {
  id: string;
  login: string;
  name: string | null;
  authState: GithubAuthState;
  scopes: string[];
  connectedAt: number | null;
};
export type GithubRepository = {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  private: boolean;
  updatedAt: number;
};
export type GithubBranch = { name: string; sha: string; protected: boolean };
export type GithubFile = {
  path: string;
  sha: string;
  size: number;
  content: string;
  encoding: "utf8";
  contentTrust: "untrusted_external_data";
};
export type GithubCommit = {
  sha: string;
  message: string;
  branch: string;
  changedFiles: string[];
  createdAt: number;
};
export type GithubPullRequest = {
  number: number;
  title: string;
  description: string;
  sourceBranch: string;
  targetBranch: string;
  status: "open" | "closed";
  commitShas: string[];
};
export type GithubIssue = {
  number: number;
  title: string;
  body: string;
  state: "open" | "closed";
  createdAt: number;
};
export type GithubChange = {
  path: string;
  beforeSha: string | null;
  afterSha: string;
  content: string;
};
export type GithubResult<T> = {
  success: boolean;
  operation: GithubOperation;
  data: T | null;
  error: { code: string; message: string; retryable: boolean } | null;
  requestId: string;
};
export type GithubProvider = {
  getAccount(): Promise<GithubAccount>;
  listRepositories(): Promise<GithubRepository[]>;
  inspectRepository(owner: string, name: string): Promise<GithubRepository>;
  listBranches(owner: string, name: string): Promise<GithubBranch[]>;
  readFile(
    owner: string,
    name: string,
    branch: string,
    path: string
  ): Promise<GithubFile>;
  createBranch(
    owner: string,
    name: string,
    branch: string,
    fromSha: string
  ): Promise<GithubBranch>;
  updateFile(input: {
    owner: string;
    name: string;
    branch: string;
    path: string;
    content: string;
    expectedSha: string | null;
    message: string;
  }): Promise<GithubChange>;
  createCommit(input: {
    owner: string;
    name: string;
    branch: string;
    message: string;
    changes: GithubChange[];
  }): Promise<GithubCommit>;
  listPullRequests(owner: string, name: string): Promise<GithubPullRequest[]>;
  createPullRequest(
    input: Omit<GithubPullRequest, "number" | "status">
  ): Promise<GithubPullRequest>;
  listIssues(owner: string, name: string): Promise<GithubIssue[]>;
  createIssue(input: {
    owner: string;
    name: string;
    title: string;
    body: string;
  }): Promise<GithubIssue>;
};
