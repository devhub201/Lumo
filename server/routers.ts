import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { ENV } from "./_core/env";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { createLumoCore } from "./lumo/core";
import { toPublicError } from "./lumo/errors";
import { DEFAULT_PERSONALITY } from "./lumo/memory";
import { lumoLogger } from "./lumo/logger";
import { ManagedLumoProvider } from "./lumo/provider";
import { buildWebSearchContext } from "./lumo/tools/web-search/context";
import {
  webSearchInputSchema,
  type WebSearchOutput,
} from "./lumo/tools/web-search/contracts";
import type { ToolResult } from "./lumo/tools/contracts";
import { buildUtilityContext } from "./lumo/tools/utility/context";
import { UTILITY_TOOL_IDS } from "./lumo/tools/utility/contracts";
import { nanoid } from "nanoid";
import {
  LUMO_PERSONALITY_SETTING_KEY,
  type LumoPersonality,
  type MemoryKind,
} from "./lumo/contracts";
import { DatabaseLumoStorage } from "./lumo/storage";
import {
  databaseSensitiveGrantService,
  SENSITIVE_ACTIONS,
} from "./lumo/security/grants";
import { githubOAuthService } from "./lumo/github/oauth";
import { gmailOAuthService } from "./lumo/gmail/oauth";
import {
  lumoRuntimeManager,
  lumoToolRouter,
  lumoToolSystem,
  lumoWorkflowExecutor,
  lumoBrowserWorkspace,
  lumoCodeWorkspace,
  lumoCodingTasks,
  lumoGithub,
  lumoGmail,
  lumoPerformance,
} from "./lumo/tools/system";
import { agentPlanSchema } from "./lumo/workflows";
import { runtimeCommandSchema } from "./lumo/runtime";
import { browserActionSchema, browserUrlSchema } from "./lumo/browser";
import {
  codeContentSchema,
  projectNameSchema,
  relativePathSchema,
} from "./lumo/coding";
import { createContextManager } from "./lumo/context/manager";
import { buildDocumentContext } from "./lumo/files/context";
import { FILE_TOOL_IDS } from "./lumo/files/contracts";
import { buildVisionContext } from "./lumo/vision/context";
import {
  cameraCaptureInputSchema,
  visionResultSchema,
  visionAnalyzeInputSchema,
} from "./lumo/vision/contracts";
import {
  blueprintCreateInputSchema,
  blueprintUpdateInputSchema,
} from "./lumo/blueprints/contracts";
import { overlayModelFromVision } from "./lumo/overlays";
import {
  teachingCreateInputSchema,
  teachingProgressInputSchema,
} from "./lumo/teaching/contracts";

const lumoStorage = new DatabaseLumoStorage();
const createRequestLumoCore = (ownerKey: string) =>
  createLumoCore({
    provider: new ManagedLumoProvider(),
    storage: lumoStorage,
    logger: lumoLogger,
    ownerKey,
    toolSystem: lumoToolSystem,
    router: lumoToolRouter,
    performance: lumoPerformance,
  });

const memoryKind = z.enum([
  "user_profile",
  "preference",
  "important_fact",
  "fact",
  "project",
  "recurring_context",
  "conversation_summary",
  "summary",
  "knowledge",
] satisfies [MemoryKind, ...MemoryKind[]]);

const personalityInput = z.object({
  name: z.literal("LUMO").default("LUMO"),
  ownerName: z.literal("Peter").default("Peter"),
  traits: z.array(z.string().min(1).max(80)).min(1).max(20),
  responseStyle: z.array(z.string().min(1).max(120)).min(1).max(20),
  boundaries: z.array(z.string().min(1).max(160)).min(1).max(20),
});

const lumoProcedure = protectedProcedure;

const lumoRouter = router({
  issueSensitiveGrant: lumoProcedure
    .input(
      z.object({
        action: z.enum(SENSITIVE_ACTIONS),
        resource: z.string().max(500).nullable().optional(),
      })
    )
    .mutation(({ input, ctx }) =>
      databaseSensitiveGrantService.issue(
        ctx.ownerKey,
        input.action,
        input.resource
      )
    ),
  githubOAuthStart: lumoProcedure.mutation(({ ctx }) =>
    githubOAuthService.start(ctx.ownerKey)
  ),
  githubOAuthStatus: lumoProcedure.query(({ ctx }) =>
    githubOAuthService.status(ctx.ownerKey)
  ),
  githubOAuthDisconnect: lumoProcedure.mutation(({ ctx }) =>
    githubOAuthService.disconnect(ctx.ownerKey)
  ),
  gmailOAuthStart: lumoProcedure.mutation(({ ctx }) =>
    gmailOAuthService.start(ctx.ownerKey)
  ),
  gmailOAuthStatus: lumoProcedure.query(({ ctx }) =>
    gmailOAuthService.status(ctx.ownerKey)
  ),
  gmailOAuthDisconnect: lumoProcedure.mutation(({ ctx }) =>
    gmailOAuthService.disconnect(ctx.ownerKey)
  ),
  listConversations: lumoProcedure.query(({ ctx }) =>
    lumoStorage.listConversations(ctx.ownerKey)
  ),

  getConversation: lumoProcedure
    .input(z.object({ id: z.string().min(1).max(36) }))
    .query(async ({ input, ctx }) => {
      const conversation = await lumoStorage.getConversation(
        ctx.ownerKey,
        input.id
      );
      if (!conversation)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Conversation not found",
        });
      const messages = await lumoStorage.listMessages(
        ctx.ownerKey,
        conversation.id,
        200
      );
      return { conversation, messages };
    }),

  send: lumoProcedure
    .input(
      z.object({
        conversationId: z.string().min(1).max(36).optional(),
        text: z.string().trim().min(1).max(4000),
        visionResult: visionResultSchema.optional(),
        visionSelection: z
          .object({
            overlayId: z.string().min(1).max(80),
            sourceIdentity: z.string().max(200),
          })
          .optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        return await createRequestLumoCore(ctx.ownerKey).sendMessage(input);
      } catch (error) {
        const safe = toPublicError(error);
        throw new TRPCError({
          code:
            safe.code === "invalid_input"
              ? "BAD_REQUEST"
              : "INTERNAL_SERVER_ERROR",
          message: safe.message,
        });
      }
    }),

  diagnostics: lumoProcedure.query(({ ctx }) => ({
    ownerKey: ctx.ownerKey,
    provider: "managed-platform-llm",
    apiConfigured: Boolean(ENV.forgeApiUrl && ENV.forgeApiKey),
    databaseConfigured: Boolean(ENV.databaseUrl),
    model: ENV.lumoModel || "platform default",
    maxTokens: ENV.lumoMaxTokens,
    timeoutMs: ENV.lumoTimeoutMs,
    futureCapabilities: [
      "tools",
      "files",
      "web",
      "vision",
      "voice",
      "blueprints",
    ],
  })),

  toolCatalog: lumoProcedure.query(({ ctx }) => lumoToolSystem.listTools()),

  workflowCatalog: lumoProcedure.query(({ ctx }) => ({
    maxSteps: 20,
    maxToolCalls: 30,
    supported: true,
    executionPath: "validated_plan_to_existing_tool_executor",
  })),

  runtimeCatalog: lumoProcedure.query(({ ctx }) => lumoRuntimeManager.list()),
  performanceCatalog: lumoProcedure.query(({ ctx }) => ({
    supported: true,
    maxMetrics: 500,
    retention: "bounded_in_memory",
    secretPolicy: "metadata_only_no_credentials_or_content",
    boundaries: [
      "tool",
      "workflow",
      "request",
      "provider",
      "workspace",
      "runtime",
    ],
  })),
  performanceSummary: lumoProcedure.query(({ ctx }) => lumoPerformance.summary()),
  performanceMetrics: lumoProcedure
    .input(z.object({ limit: z.number().int().min(0).max(100).default(50) }))
    .query(({ input, ctx }) => lumoPerformance.list(input.limit)),

  codingWorkspaceCatalog: lumoProcedure.query(({ ctx }) => ({
    supported: true,
    maxFileBytes: 1_000_000,
    operations: [
      "project",
      "file",
      "patch",
      "snapshot",
      "diff",
      "analyze",
      "task",
    ],
    executionPath: "coding_workspace_to_workflow_to_permission_to_runtime",
  })),

  browserWorkspaceCatalog: lumoProcedure.query(({ ctx }) => ({
    supported: true,
    maxContentChars: 12_000,
    operations: ["open", "navigate", "snapshot", "extract", "links"],
    contentTrust: "untrusted_web_data",
  })),

  githubCatalog: lumoProcedure.query(({ ctx }) => ({
    supported: true,
    providerMode: "mock_disconnected_until_explicit_provider_connection",
    operations: [
      "account",
      "list_repositories",
      "inspect_repository",
      "list_branches",
      "read_file",
      "create_branch",
      "update_file",
      "create_commit",
      "pull_requests",
      "create_pull_request",
      "issues",
      "create_issue",
    ],
    contentTrust: "untrusted_external_data",
  })),
  gmailCatalog: lumoProcedure.query(({ ctx }) => ({
    supported: true,
    providerMode: "mock_disconnected_until_explicit_provider_connection",
    operations: [
      "account",
      "list_messages",
      "search_messages",
      "inspect_message",
      "inspect_thread",
      "list_labels",
      "create_draft",
      "send",
    ],
    contentTrust: "untrusted_external_data",
    sending: "explicit_sensitive_authorization_required",
  })),
  githubAccount: lumoProcedure.query(({ ctx }) =>
    lumoGithub.account(ctx.ownerKey)
  ),
  githubRepositories: lumoProcedure.query(({ ctx }) =>
    lumoGithub.listRepositories(ctx.ownerKey)
  ),
  githubReadFile: lumoProcedure
    .input(
      z.object({
        owner: z.string().min(1).max(100),
        name: z.string().min(1).max(100),
        branch: z.string().min(1).max(100),
        path: relativePathSchema,
      })
    )
    .query(({ input, ctx }) => lumoGithub.readFile(ctx.ownerKey, input)),
  gmailAccount: lumoProcedure.query(({ ctx }) => lumoGmail.account(ctx.ownerKey)),
  gmailSearch: lumoProcedure
    .input(
      z.object({
        query: z.string().trim().min(1).max(300),
        limit: z.number().int().min(1).max(50).default(20),
      })
    )
    .query(({ input, ctx }) =>
      lumoGmail.search(ctx.ownerKey, input.query, input.limit)
    ),
  gmailMessage: lumoProcedure
    .input(z.object({ id: z.string().min(1).max(100) }))
    .query(({ input, ctx }) => lumoGmail.message(ctx.ownerKey, input.id)),
  gmailCreateDraft: lumoProcedure
    .input(
      z.object({
        to: z.array(z.string().email()).min(1).max(20),
        subject: z.string().max(300),
        body: z.string().max(100_000),
      })
    )
    .mutation(({ input, ctx }) => lumoGmail.draft(ctx.ownerKey, input)),
  gmailSend: lumoProcedure
    .input(
      z.object({
        to: z.array(z.string().email()).min(1).max(20),
        subject: z.string().max(300),
        body: z.string().max(100_000),
        idempotencyKey: z.string().min(1).max(120),
        authorization: z
          .object({
            grantToken: z.string().min(20).max(200),
            action: z.string().max(80),
            resource: z.string().max(500).nullable().optional(),
          })
          .optional(),
      })
    )
    .mutation(({ input, ctx }) =>
      lumoGmail.send(ctx.ownerKey, input, input.authorization)
    ),

  codeCreateProject: lumoProcedure
    .input(z.object({ name: projectNameSchema }))
    .mutation(({ input, ctx }) =>
      lumoCodeWorkspace.createProject(ctx.ownerKey, input.name)
    ),
  codeListProjects: lumoProcedure.query(({ ctx }) =>
    lumoCodeWorkspace.list(ctx.ownerKey)
  ),
  codeReadFile: lumoProcedure
    .input(
      z.object({ projectId: z.string().max(80), path: relativePathSchema })
    )
    .query(({ input, ctx }) =>
      lumoCodeWorkspace.readFile(ctx.ownerKey, input.projectId, input.path)
    ),
  codeApplyPatch: lumoProcedure
    .input(
      z.object({
        projectId: z.string().max(80),
        path: relativePathSchema,
        beforeHash: z.string().length(64).optional(),
        content: codeContentSchema,
      })
    )
    .mutation(({ input, ctx }) =>
      lumoCodeWorkspace.applyPatch(ctx.ownerKey, input.projectId, input)
    ),
  codeAnalyze: lumoProcedure
    .input(z.object({ projectId: z.string().max(80) }))
    .query(({ input, ctx }) =>
      lumoCodeWorkspace.analyze(ctx.ownerKey, input.projectId)
    ),
  codeSnapshot: lumoProcedure
    .input(z.object({ projectId: z.string().max(80) }))
    .query(({ input, ctx }) =>
      lumoCodeWorkspace.snapshot(ctx.ownerKey, input.projectId)
    ),
  codeRunTask: lumoProcedure
    .input(
      z.object({
        projectId: z.string().max(80),
        requestId: z.string().max(120),
        kind: z.enum(["test", "build", "lint"]),
        authorization: z
          .object({
            grantToken: z.string().min(20).max(200),
            action: z.string().max(80),
            resource: z.string().max(500).nullable().optional(),
          })
          .optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const task = lumoCodingTasks.create(
        ctx.ownerKey,
        input.projectId,
        input.requestId
      );
      return {
        task,
        result: await lumoCodingTasks.run(
          task,
          input.kind,
          ctx.ownerKey,
          input.authorization
        ),
      };
    }),

  browserCreateSession: lumoProcedure.mutation(({ ctx }) =>
    lumoBrowserWorkspace.createSession(ctx.ownerKey)
  ),
  browserOpen: lumoProcedure
    .input(z.object({ sessionId: z.string().max(80), url: browserUrlSchema }))
    .mutation(({ input, ctx }) =>
      lumoBrowserWorkspace.open(ctx.ownerKey, input.sessionId, input.url)
    ),
  browserSnapshot: lumoProcedure
    .input(z.object({ sessionId: z.string().max(80) }))
    .query(({ input, ctx }) =>
      lumoBrowserWorkspace.snapshot(ctx.ownerKey, input.sessionId)
    ),
  browserAction: lumoProcedure
    .input(
      z.object({ sessionId: z.string().max(80), action: browserActionSchema })
    )
    .mutation(({ input, ctx }) =>
      lumoBrowserWorkspace.action(ctx.ownerKey, input.sessionId, input.action)
    ),

  runWorkflow: lumoProcedure
    .input(
      z.object({
        plan: agentPlanSchema,
        signal: z.undefined().optional(),
      })
    )
    .mutation(async ({ input, ctx }) =>
      lumoWorkflowExecutor.execute(input.plan, { ownerKey: ctx.ownerKey })
    ),

  runtimeStatus: lumoProcedure
    .input(z.object({ targetId: z.string().min(1).max(80) }))
    .query(async ({ input, ctx }) => {
      const target = lumoRuntimeManager
        .list()
        .find(candidate => candidate.id === input.targetId);
      return target
        ? { target, status: target.connectionState }
        : { target: null, status: "offline" as const };
    }),

  runRuntime: lumoProcedure
    .input(
      z.object({
        targetId: z.string().min(1).max(80),
        command: runtimeCommandSchema,
        authorization: z
          .object({
            grantToken: z.string().min(20).max(200),
            action: z.string().max(80),
            resource: z.string().max(500).nullable().optional(),
          })
          .optional(),
      })
    )
    .mutation(async ({ input, ctx }) =>
      lumoRuntimeManager.execute({
        targetId: input.targetId,
        command: input.command,
        ownerKey: ctx.ownerKey,
        authorization: input.authorization,
      })
    ),

  routeRequest: lumoProcedure
    .input(
      z.object({
        text: z.string().trim().min(1).max(4000),
        recentMessages: z
          .array(
            z.object({
              role: z.string().max(20),
              content: z.string().max(4000),
            })
          )
          .max(8)
          .optional(),
        summary: z.string().max(2000).nullable().optional(),
        routingDepth: z.number().int().min(0).max(1).optional(),
        previousFingerprints: z.array(z.string().max(300)).max(4).optional(),
      })
    )
    .mutation(async ({ input, ctx }) =>
      lumoToolRouter.route({
        text: input.text,
        ownerKey: ctx.ownerKey,
        requestId: nanoid(12),
        context: {
          recentMessages: input.recentMessages,
          summary: input.summary,
        },
        routingDepth: input.routingDepth,
        previousFingerprints: input.previousFingerprints,
      })
    ),

  searchWeb: lumoProcedure
    .input(webSearchInputSchema)
    .mutation(async ({ input, ctx }) => {
      const requestId = nanoid(12);
      const result = (await lumoToolSystem.execute({
        toolId: "web_search",
        arguments: input,
        ownerKey: ctx.ownerKey,
        requestId,
      })) as ToolResult<WebSearchOutput>;
      const context = buildWebSearchContext(lumoLogger, {
        requestId,
        currentRequest: input.query,
        personality: DEFAULT_PERSONALITY,
        searchResult: result,
      });
      return {
        result,
        context: {
          metadata: context.metadata,
          source: "web_evidence",
        },
      };
    }),

  runUtility: lumoProcedure
    .input(
      z.object({
        toolId: z.enum(UTILITY_TOOL_IDS),
        arguments: z.unknown(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const requestId = nanoid(12);
      const result = (await lumoToolSystem.execute({
        toolId: input.toolId,
        arguments: input.arguments,
        ownerKey: ctx.ownerKey,
        requestId,
      })) as ToolResult<unknown>;
      const context = buildUtilityContext(lumoLogger, {
        requestId,
        currentRequest: `${input.toolId} utility request`,
        personality: DEFAULT_PERSONALITY,
        utilityResult: result,
      });
      return {
        result,
        context: {
          metadata: context.metadata,
          source: "utility_result",
        },
      };
    }),

  runFile: lumoProcedure
    .input(
      z.object({
        toolId: z.enum(FILE_TOOL_IDS),
        arguments: z.unknown(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const requestId = nanoid(12);
      const result = (await lumoToolSystem.execute({
        toolId: input.toolId,
        arguments: input.arguments,
        ownerKey: ctx.ownerKey,
        requestId,
      })) as ToolResult<any>;
      const documentContext = buildDocumentContext(result);
      const context = createContextManager(lumoLogger).build({
        requestId,
        currentRequest: `${input.toolId} document request`,
        personality: DEFAULT_PERSONALITY,
        toolResults: documentContext ? [documentContext] : [],
      });
      return {
        result,
        context: {
          metadata: context.metadata,
          messages: context.messages,
          source: "managed_document",
        },
      };
    }),

  runVision: lumoProcedure
    .input(
      z.object({
        toolId: z.enum(["vision_analyze", "camera_capture"]),
        arguments: z.union([
          visionAnalyzeInputSchema,
          cameraCaptureInputSchema,
        ]),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const requestId = nanoid(12);
      const result = (await lumoToolSystem.execute({
        toolId: input.toolId,
        arguments: input.arguments,
        ownerKey: ctx.ownerKey,
        requestId,
      })) as ToolResult<any>;
      const visionContext = buildVisionContext(result);
      const context = createContextManager(lumoLogger).build({
        requestId,
        currentRequest: `${input.toolId} visual request`,
        personality: DEFAULT_PERSONALITY,
        toolResults: visionContext ? [visionContext] : [],
      });
      return {
        result,
        overlay:
          result.success && result.data?.source.dimensions
            ? overlayModelFromVision(result.data, result.data.source.dimensions)
            : null,
        context: {
          metadata: context.metadata,
          messages: context.messages,
          source: "vision_observation",
        },
      };
    }),

  runBlueprint: lumoProcedure
    .input(
      z.object({
        toolId: z.enum([
          "blueprint_create",
          "blueprint_update",
          "blueprint_clear",
        ]),
        arguments: z.union([
          blueprintCreateInputSchema,
          blueprintUpdateInputSchema,
          z.object({ blueprintId: z.string().min(1).max(80) }),
        ]),
      })
    )
    .mutation(async ({ input, ctx }) =>
      lumoToolSystem.execute({
        toolId: input.toolId,
        arguments: input.arguments,
        ownerKey: ctx.ownerKey,
        requestId: nanoid(12),
      })
    ),

  runTeaching: lumoProcedure
    .input(
      z.object({
        toolId: z.enum(["teaching_create", "teaching_progress"]),
        arguments: z.union([
          teachingCreateInputSchema,
          teachingProgressInputSchema,
        ]),
      })
    )
    .mutation(async ({ input, ctx }) =>
      lumoToolSystem.execute({
        toolId: input.toolId,
        arguments: input.arguments,
        ownerKey: ctx.ownerKey,
        requestId: nanoid(12),
      })
    ),

  getPersonality: lumoProcedure.query(async ({ ctx }) => {
    try {
      const raw = await lumoStorage.getSetting(
        ctx.ownerKey,
        LUMO_PERSONALITY_SETTING_KEY
      );
      return raw
        ? {
            ...DEFAULT_PERSONALITY,
            ...(JSON.parse(raw) as Partial<LumoPersonality>),
          }
        : DEFAULT_PERSONALITY;
    } catch {
      return DEFAULT_PERSONALITY;
    }
  }),

  updatePersonality: lumoProcedure
    .input(personalityInput)
    .mutation(async ({ input, ctx }) => {
      await lumoStorage.setSetting(
        ctx.ownerKey,
        LUMO_PERSONALITY_SETTING_KEY,
        JSON.stringify(input)
      );
      return input;
    }),

  listMemories: lumoProcedure.query(({ ctx }) =>
    lumoStorage.listMemories(ctx.ownerKey)
  ),

  createMemory: lumoProcedure
    .input(
      z.object({
        kind: memoryKind,
        content: z.string().trim().min(1).max(2000),
        tags: z.string().trim().max(500).optional(),
        importance: z.number().int().min(1).max(100).default(50),
      })
    )
    .mutation(({ input, ctx }) =>
      lumoStorage.createMemory({
        ...input,
        ownerKey: ctx.ownerKey,
        source: "explicit",
      })
    ),

  remember: lumoProcedure
    .input(
      z.object({
        content: z.string().trim().min(1).max(2000),
        kind: memoryKind.optional(),
        importance: z.number().int().min(1).max(100).default(85),
      })
    )
    .mutation(({ input, ctx }) =>
      lumoStorage.createMemory({
        ...input,
        ownerKey: ctx.ownerKey,
        kind: input.kind ?? "important_fact",
        source: "explicit",
      })
    ),

  deleteMemory: lumoProcedure
    .input(z.object({ id: z.string().min(1).max(36) }))
    .mutation(async ({ input, ctx }) => {
      await lumoStorage.deactivateMemory(ctx.ownerKey, input.id);
      return { success: true } as const;
    }),

  forget: lumoProcedure
    .input(z.object({ query: z.string().trim().min(1).max(500) }))
    .mutation(async ({ input, ctx }) => {
      const matches = await lumoStorage.searchMemories(
        ctx.ownerKey,
        input.query,
        1
      );
      if (matches[0])
        await lumoStorage.deactivateMemory(ctx.ownerKey, matches[0].id);
      return { success: Boolean(matches[0]) } as const;
    }),

  recall: lumoProcedure.query(({ ctx }) => lumoStorage.listMemories(ctx.ownerKey)),
});

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  lumo: lumoRouter,
});

export type AppRouter = typeof appRouter;
