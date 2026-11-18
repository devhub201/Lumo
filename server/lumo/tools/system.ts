import { nanoid } from "nanoid";
import { lumoLogger } from "../logger";
import { ToolExecutor } from "./executor";
import { ManagedToolPermissions } from "../security/tool-permissions";
import { PermissionManager } from "../security/permissions";
import { InMemoryToolRegistry } from "./registry";
import type { ToolSystem } from "./contracts";
import type { ToolDefinition } from "./contracts";
import { createToolRouter } from "../routing";
import { utilityTools } from "./utility";
import { createWebSearchTool } from "./web-search";
import { fileTools } from "../files";
import { visionTools } from "../vision";
import { blueprintTools } from "../blueprints";
import { teachingTools } from "../teaching";
import { ShellRuntimeProvider, RuntimeManager } from "../runtime";
import { createWorkflowExecutor } from "../workflows";
import { createCodeWorkspace, CodingTaskManager } from "../coding";
import { BrowserWorkspace } from "../browser";
import { PlaywrightBrowserProvider } from "../browser/playwright-provider";
import { z } from "zod";
import { GithubManager, MockGithubProvider } from "../github";
import { GmailManager, MockGmailProvider } from "../gmail";
import { PerformanceRecorder, PERFORMANCE_LIMITS } from "../performance";

export const lumoToolRegistry = new InMemoryToolRegistry();
export const lumoPermissionManager = new PermissionManager();
export const lumoToolPermissions = new ManagedToolPermissions(
  lumoPermissionManager,
  // Full autonomy, granted by default — Peter's explicit choice for his own,
  // single-user instance of Lumo: terminal, browser, SSH and memory access
  // all stand authorized without a per-action prompt. Toggling the
  // corresponding switch off in Settings revokes the matching capability
  // for real (see PermissionManager.deny), it isn't just cosmetic.
  [
    "network",
    "files",
    "vision",
    "camera",
    "blueprint",
    "teaching",
    "terminal",
  ]
);
export const lumoRuntimeManager = new RuntimeManager(
  lumoPermissionManager,
  new ShellRuntimeProvider()
);
lumoRuntimeManager.register({
  id: "local-shell",
  provider: "sandboxed-shell",
  displayName: "Sandboxed Shell",
  connectionState: "ready",
  capabilities: ["shell", "filesystem"],
  authorized: true,
  metadata: { mode: "real", environment: "sandbox" },
});
export const lumoCodeWorkspace = createCodeWorkspace(lumoPermissionManager);
export const lumoCodingTasks = new CodingTaskManager(
  lumoPermissionManager,
  lumoRuntimeManager,
  lumoCodeWorkspace
);
// Real Chromium under the hood, not a fetch-only reader — this is what lets
// Lumo click buttons, fill forms and log in on Peter's behalf.
export const lumoPlaywrightProvider = new PlaywrightBrowserProvider();
export const lumoBrowserWorkspace = new BrowserWorkspace(
  lumoPermissionManager,
  lumoPlaywrightProvider
);
export const lumoGithubProvider = new MockGithubProvider();
export const lumoGithub = new GithubManager(
  lumoPermissionManager,
  lumoGithubProvider
);
export const lumoGmailProvider = new MockGmailProvider();
export const lumoGmail = new GmailManager(
  lumoPermissionManager,
  lumoGmailProvider
);
export const lumoPerformance = new PerformanceRecorder(
  PERFORMANCE_LIMITS.maxTelemetryMetrics
);
lumoToolRegistry.register(createWebSearchTool());
for (const tool of utilityTools)
  lumoToolRegistry.register(tool as ToolDefinition);
for (const tool of fileTools) lumoToolRegistry.register(tool as ToolDefinition);
for (const tool of visionTools)
  lumoToolRegistry.register(tool as ToolDefinition);
for (const tool of blueprintTools)
  lumoToolRegistry.register(tool as ToolDefinition);
for (const tool of teachingTools)
  lumoToolRegistry.register(tool as ToolDefinition);
lumoToolRegistry.register({
  id: "coding_workspace",
  name: "Coding Workspace",
  description:
    "Manage an owner-scoped project workspace without arbitrary shell access.",
  category: "system",
  inputSchema: z
    .object({
      operation: z.string().max(40),
      projectId: z.string().max(80).optional(),
      path: z.string().max(240).optional(),
      content: z.string().max(1_000_000).optional(),
    })
    .nullable(),
  outputSchema: z.unknown(),
  permissions: ["files"],
  enabled: true,
  handler: async (input, context) => {
    if (!input) return { ok: false, needs: "operation and project details" };
    if (input.operation === "list")
      return lumoCodeWorkspace.list(context.ownerKey);
    if (input.operation === "create_project")
      return lumoCodeWorkspace.createProject(
        context.ownerKey,
        input.path ?? "project"
      );
    if (input.operation === "read" && input.projectId && input.path)
      return lumoCodeWorkspace.readFile(
        context.ownerKey,
        input.projectId,
        input.path
      );
    if (
      input.operation === "write" &&
      input.projectId &&
      input.path &&
      input.content !== undefined
    )
      return lumoCodeWorkspace.writeFile(
        context.ownerKey,
        input.projectId,
        input.path,
        input.content,
        "create"
      );
    return {
      ok: false,
      needs: "supported coding operation and required fields",
    };
  },
});
lumoToolRegistry.register({
  id: "terminal_exec",
  name: "Terminal",
  description:
    "Run a real shell command in Lumo's sandboxed workspace — full shell, not a whitelist. Use for anything that needs the terminal: installing things, running scripts, inspecting files, managing processes.",
  category: "system",
  inputSchema: z
    .object({
      command: z.string().min(1).max(4000),
      cwd: z.string().max(500).optional(),
      timeoutMs: z.number().int().min(50).max(120000).optional(),
    })
    .nullable(),
  outputSchema: z.unknown(),
  permissions: ["terminal"],
  enabled: true,
  handler: async (input, context) => {
    if (!input?.command) return { ok: false, needs: "a shell command to run" };
    const result = await lumoRuntimeManager.execute({
      targetId: "local-shell",
      ownerKey: context.ownerKey,
      command: {
        kind: "exec",
        command: input.command,
        args: [],
        cwd: input.cwd ?? "/workspace",
        timeoutMs: input.timeoutMs ?? 10000,
        maxOutputChars: 8000,
      },
    });
    return result;
  },
});
lumoToolRegistry.register({
  id: "browser_workspace",
  name: "Browser Workspace",
  description:
    "Drive a real, interactive browser — navigate, click, type into fields, choose dropdown options, scroll, and extract page text/links as explicitly marked untrusted data. Backed by a real Chromium instance, so this can log in, submit forms and click through flows on Peter's behalf.",
  category: "external",
  inputSchema: z
    .object({
      operation: z.string().max(40),
      sessionId: z.string().max(80).optional(),
      url: z.string().max(2048).optional(),
      target: z.string().max(300).optional(),
      value: z.string().max(2000).optional(),
    })
    .nullable(),
  outputSchema: z.unknown(),
  permissions: ["network"],
  enabled: true,
  handler: async (input, context) => {
    if (!input) return { ok: false, needs: "operation and browser details" };
    if (input.operation === "create_session")
      return lumoBrowserWorkspace.createSession(context.ownerKey);
    if (input.operation === "close_session" && input.sessionId)
      return lumoBrowserWorkspace.closeSession(context.ownerKey, input.sessionId);
    if (input.operation === "open" && input.sessionId && input.url)
      return lumoBrowserWorkspace.open(
        context.ownerKey,
        input.sessionId,
        input.url
      );
    if (input.operation === "snapshot" && input.sessionId)
      return lumoBrowserWorkspace.snapshot(context.ownerKey, input.sessionId);
    if (
      ["click", "type", "select", "scroll", "navigate", "extract"].includes(
        input.operation
      ) &&
      input.sessionId
    )
      return lumoBrowserWorkspace.action(context.ownerKey, input.sessionId, {
        id: nanoid(10),
        type: input.operation as "click" | "type" | "select" | "scroll" | "navigate" | "extract",
        target: input.target,
        value: input.operation === "navigate" ? input.url : input.value,
      });
    return {
      ok: false,
      needs: "supported browser operation and required fields",
    };
  },
});
lumoToolRegistry.register({
  id: "github_integration",
  name: "GitHub Integration",
  description:
    "Inspect authorized GitHub repositories and prepare controlled repository changes.",
  category: "external",
  inputSchema: z
    .object({
      operation: z.string().max(40),
      owner: z.string().max(100).optional(),
      name: z.string().max(100).optional(),
      branch: z.string().max(100).optional(),
      path: z.string().max(300).optional(),
    })
    .nullable(),
  outputSchema: z.unknown(),
  permissions: ["external"],
  enabled: true,
  handler: async (input, context) => {
    if (!input) return { ok: false, needs: "GitHub operation details" };
    if (input.operation === "list_repositories")
      return lumoGithub.listRepositories(context.ownerKey);
    if (input.operation === "account")
      return lumoGithub.account(context.ownerKey);
    if (input.operation === "inspect_repository" && input.owner && input.name)
      return lumoGithub.inspect(context.ownerKey, {
        owner: input.owner,
        name: input.name,
      });
    if (
      input.operation === "read_file" &&
      input.owner &&
      input.name &&
      input.branch &&
      input.path
    )
      return lumoGithub.readFile(context.ownerKey, {
        owner: input.owner,
        name: input.name,
        branch: input.branch,
        path: input.path,
      });
    return {
      ok: false,
      needs: "supported read-only GitHub operation and required fields",
    };
  },
});
lumoToolRegistry.register({
  id: "gmail_integration",
  name: "Gmail Integration",
  description:
    "Search authorized Gmail content and create drafts without silently sending mail.",
  category: "external",
  inputSchema: z
    .object({
      operation: z.string().max(40),
      query: z.string().max(300).optional(),
      messageId: z.string().max(100).optional(),
    })
    .nullable(),
  outputSchema: z.unknown(),
  permissions: ["external"],
  enabled: true,
  handler: async (input, context) => {
    if (!input) return { ok: false, needs: "Gmail operation details" };
    if (input.operation === "account")
      return lumoGmail.account(context.ownerKey);
    if (input.operation === "list_messages")
      return lumoGmail.list(context.ownerKey);
    if (input.operation === "search_messages" && input.query)
      return lumoGmail.search(context.ownerKey, input.query);
    if (input.operation === "inspect_message" && input.messageId)
      return lumoGmail.message(context.ownerKey, input.messageId);
    return {
      ok: false,
      needs: "supported read-only Gmail operation and required fields",
    };
  },
});
export const lumoToolExecutor = new ToolExecutor(
  lumoToolRegistry,
  lumoToolPermissions,
  lumoLogger,
  lumoPerformance
);

export const lumoToolRouter = createToolRouter({
  registry: lumoToolRegistry,
  permissions: lumoToolPermissions,
});

export const lumoToolSystem: ToolSystem = {
  execute: input => lumoToolExecutor.execute(input),
  listTools: () => lumoToolRegistry.listPublic(),
};
export const lumoWorkflowExecutor = createWorkflowExecutor(
  lumoToolSystem,
  lumoPerformance
);
