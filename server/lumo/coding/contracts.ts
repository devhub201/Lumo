import { z } from "zod";
export const codingStatusSchema = z.enum([
  "queued",
  "planning",
  "inspecting",
  "editing",
  "validating",
  "testing",
  "completed",
  "failed",
  "cancelled",
  "blocked",
]);
export type CodingStatus = z.infer<typeof codingStatusSchema>;
export type WorkspaceFile = {
  id: string;
  projectId: string;
  path: string;
  language: string;
  sizeBytes: number;
  createdAt: number;
  updatedAt: number;
  hash: string;
};
export type WorkspaceDirectory = { path: string; entries: string[] };
export type WorkspaceProject = {
  id: string;
  workspaceId: string;
  name: string;
  root: string;
  createdAt: number;
  updatedAt: number;
  status: "open" | "closed";
};
export type CodeChange = {
  operationId: string;
  projectId: string;
  files: string[];
  kind: "create" | "edit" | "delete" | "rename" | "mkdir" | "rollback";
  beforeHash?: string;
  afterHash?: string;
  timestamp: number;
  diagnostics: Diagnostic[];
};
export type Patch = { path: string; beforeHash?: string; content: string };
export type Diagnostic = {
  severity: "info" | "warning" | "error";
  message: string;
  path?: string;
  line?: number;
  code?: string;
};
export type CodeTask = {
  id: string;
  requestId: string;
  projectId: string;
  status: CodingStatus;
  maxIterations: number;
  timeoutMs: number;
  diagnostics: Diagnostic[];
  partial: boolean;
};
export type CodeExecution = {
  id: string;
  taskId: string;
  kind: "test" | "build" | "lint";
  status: "running" | "completed" | "failed" | "cancelled";
  stdout: string;
  stderr: string;
};
export type CodeTestResult = {
  executionId: string;
  passed: boolean;
  tests: number;
  failed: number;
  diagnostics: Diagnostic[];
};
export type BuildResult = {
  executionId: string;
  success: boolean;
  diagnostics: Diagnostic[];
};
export type WorkspaceSnapshot = {
  id: string;
  projectId: string;
  files: Array<{ path: string; hash: string; content?: string }>;
  createdAt: number;
};
export const projectNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9_-]+$/);
export const relativePathSchema = z
  .string()
  .trim()
  .min(1)
  .max(300)
  .refine(
    v =>
      !v.startsWith("/") && !v.includes("\\") && !v.split("/").includes(".."),
    "Unsafe workspace path"
  );
export const codeContentSchema = z
  .string()
  .max(1_000_000)
  .refine(v => !v.includes("\u0000"), "Unsafe null byte");
