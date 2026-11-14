import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { ownerKeyForUser } from "../lumo/security/owner";
import { FixedWindowRateLimiter, rateLimitConfig } from "./rateLimit";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);

/**
 * Every LUMO data/tool procedure uses this: the caller must be signed in, and
 * `ctx.ownerKey` is derived server-side from that session. No procedure may
 * read an owner identity from client input.
 */
export const ownerProcedure = protectedProcedure.use(async opts => {
  const { ctx, next } = opts;
  return next({
    ctx: {
      ...ctx,
      ownerKey: ownerKeyForUser(ctx.user),
    },
  });
});

const expensiveLimiter = new FixedWindowRateLimiter({
  windowMs: 60_000,
  max: rateLimitConfig().expensivePerMinute,
});

/** For procedures that cost money, spawn work, or reach the network. */
export const expensiveProcedure = ownerProcedure.use(async opts => {
  const { ctx, next } = opts;
  const result = expensiveLimiter.hit(`owner:${ctx.ownerKey}`);
  if (!result.allowed) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: `Rate limit reached. Try again in ${Math.ceil(result.retryAfterMs / 1000)}s.`,
    });
  }
  return next();
});
