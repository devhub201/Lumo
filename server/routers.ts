import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { ENV } from "./_core/env";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
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
  LUMO_OWNER_KEY,
  LUMO_PERSONALITY_SETTING_KEY,
  type LumoPersonality,
  type MemoryKind,
} from "./lumo/contracts";
import { DatabaseLumoStorage } from "./lumo/storage";
import { lumoToolRouter, lumoToolSystem } from "./lumo/tools/system";
import { createContextManager } from "./lumo/context/manager";
import { buildDocumentContext } from "./lumo/files/context";
import { FILE_TOOL_IDS } from "./lumo/files/contracts";
import { buildVisionContext } from "./lumo/vision/context";
import {
  cameraCaptureInputSchema,
  visionResultSchema,
  visionAnalyzeInputSchema,
} from "./lumo/vision/contracts";

const lumoStorage = new DatabaseLumoStorage();
const lumoCore = createLumoCore({
  provider: new ManagedLumoProvider(),
  storage: lumoStorage,
  logger: lumoLogger,
  ownerKey: LUMO_OWNER_KEY,
  toolSystem: lumoToolSystem,
  router: lumoToolRouter,
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

const lumoRouter = router({
  listConversations: publicProcedure.query(() =>
    lumoStorage.listConversations(LUMO_OWNER_KEY)
  ),

  getConversation: publicProcedure
    .input(z.object({ id: z.string().min(1).max(36) }))
    .query(async ({ input }) => {
      const conversation = await lumoStorage.getConversation(
        LUMO_OWNER_KEY,
        input.id
      );
      if (!conversation)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Conversation not found",
        });
      const messages = await lumoStorage.listMessages(conversation.id, 200);
      return { conversation, messages };
    }),

  send: publicProcedure
    .input(
      z.object({
        conversationId: z.string().min(1).max(36).optional(),
        text: z.string().trim().min(1).max(4000),
        visionResult: visionResultSchema.optional(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        return await lumoCore.sendMessage(input);
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

  diagnostics: publicProcedure.query(() => ({
    ownerKey: LUMO_OWNER_KEY,
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

  toolCatalog: publicProcedure.query(() => lumoToolSystem.listTools()),

  routeRequest: publicProcedure
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
    .mutation(async ({ input }) =>
      lumoToolRouter.route({
        text: input.text,
        ownerKey: LUMO_OWNER_KEY,
        requestId: nanoid(12),
        context: {
          recentMessages: input.recentMessages,
          summary: input.summary,
        },
        routingDepth: input.routingDepth,
        previousFingerprints: input.previousFingerprints,
      })
    ),

  searchWeb: publicProcedure
    .input(webSearchInputSchema)
    .mutation(async ({ input }) => {
      const requestId = nanoid(12);
      const result = (await lumoToolSystem.execute({
        toolId: "web_search",
        arguments: input,
        ownerKey: LUMO_OWNER_KEY,
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

  runUtility: publicProcedure
    .input(
      z.object({
        toolId: z.enum(UTILITY_TOOL_IDS),
        arguments: z.unknown(),
      })
    )
    .mutation(async ({ input }) => {
      const requestId = nanoid(12);
      const result = (await lumoToolSystem.execute({
        toolId: input.toolId,
        arguments: input.arguments,
        ownerKey: LUMO_OWNER_KEY,
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

  runFile: publicProcedure
    .input(
      z.object({
        toolId: z.enum(FILE_TOOL_IDS),
        arguments: z.unknown(),
      })
    )
    .mutation(async ({ input }) => {
      const requestId = nanoid(12);
      const result = (await lumoToolSystem.execute({
        toolId: input.toolId,
        arguments: input.arguments,
        ownerKey: LUMO_OWNER_KEY,
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

  runVision: publicProcedure
    .input(
      z.object({
        toolId: z.enum(["vision_analyze", "camera_capture"]),
        arguments: z.union([
          visionAnalyzeInputSchema,
          cameraCaptureInputSchema,
        ]),
      })
    )
    .mutation(async ({ input }) => {
      const requestId = nanoid(12);
      const result = (await lumoToolSystem.execute({
        toolId: input.toolId,
        arguments: input.arguments,
        ownerKey: LUMO_OWNER_KEY,
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
        context: {
          metadata: context.metadata,
          messages: context.messages,
          source: "vision_observation",
        },
      };
    }),

  getPersonality: publicProcedure.query(async () => {
    try {
      const raw = await lumoStorage.getSetting(
        LUMO_OWNER_KEY,
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

  updatePersonality: publicProcedure
    .input(personalityInput)
    .mutation(async ({ input }) => {
      await lumoStorage.setSetting(
        LUMO_OWNER_KEY,
        LUMO_PERSONALITY_SETTING_KEY,
        JSON.stringify(input)
      );
      return input;
    }),

  listMemories: publicProcedure.query(() =>
    lumoStorage.listMemories(LUMO_OWNER_KEY)
  ),

  createMemory: publicProcedure
    .input(
      z.object({
        kind: memoryKind,
        content: z.string().trim().min(1).max(2000),
        tags: z.string().trim().max(500).optional(),
        importance: z.number().int().min(1).max(100).default(50),
      })
    )
    .mutation(({ input }) =>
      lumoStorage.createMemory({
        ...input,
        ownerKey: LUMO_OWNER_KEY,
        source: "explicit",
      })
    ),

  remember: publicProcedure
    .input(
      z.object({
        content: z.string().trim().min(1).max(2000),
        kind: memoryKind.optional(),
        importance: z.number().int().min(1).max(100).default(85),
      })
    )
    .mutation(({ input }) =>
      lumoStorage.createMemory({
        ...input,
        ownerKey: LUMO_OWNER_KEY,
        kind: input.kind ?? "important_fact",
        source: "explicit",
      })
    ),

  deleteMemory: publicProcedure
    .input(z.object({ id: z.string().min(1).max(36) }))
    .mutation(async ({ input }) => {
      await lumoStorage.deactivateMemory(LUMO_OWNER_KEY, input.id);
      return { success: true } as const;
    }),

  forget: publicProcedure
    .input(z.object({ query: z.string().trim().min(1).max(500) }))
    .mutation(async ({ input }) => {
      const matches = await lumoStorage.searchMemories(
        LUMO_OWNER_KEY,
        input.query,
        1
      );
      if (matches[0])
        await lumoStorage.deactivateMemory(LUMO_OWNER_KEY, matches[0].id);
      return { success: Boolean(matches[0]) } as const;
    }),

  recall: publicProcedure.query(() => lumoStorage.listMemories(LUMO_OWNER_KEY)),
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
