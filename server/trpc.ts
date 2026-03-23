import { initTRPC, TRPCError } from "@trpc/server";
import { type NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import superjson from "superjson";
import { ZodError } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

// ─── Context ──────────────────────────────────────────────────────────────────

export async function createTRPCContext(opts: { req: NextRequest }) {
  const session = await getServerSession(authOptions);

  return {
    db,
    session,
    req: opts.req,
  };
}

export type Context = Awaited<ReturnType<typeof createTRPCContext>>;

// ─── tRPC Init ────────────────────────────────────────────────────────────────

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

// ─── Middleware ───────────────────────────────────────────────────────────────

const timingMiddleware = t.middleware(async ({ next, path }) => {
  const start = Date.now();
  const result = await next();
  const ms = Date.now() - start;
  if (process.env.NODE_ENV === "development") {
    console.log(`[tRPC] ${path} took ${ms}ms`);
  }
  return result;
});

const isAuthenticated = t.middleware(({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({
    ctx: {
      ...ctx,
      session: ctx.session,
    },
  });
});

const isAdmin = t.middleware(({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  if (ctx.session.user.role !== "ADMIN") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Admin access required",
    });
  }
  return next({ ctx: { ...ctx, session: ctx.session } });
});

const isReviewerOrAdmin = t.middleware(({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  if (!["ADMIN", "REVIEWER"].includes(ctx.session.user.role)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Reviewer or Admin access required",
    });
  }
  return next({ ctx: { ...ctx, session: ctx.session } });
});

// ─── Procedure Builders ───────────────────────────────────────────────────────

export const createCallerFactory = t.createCallerFactory;
export const createTRPCRouter = t.router;

export const publicProcedure = t.procedure.use(timingMiddleware);
export const protectedProcedure = t.procedure
  .use(timingMiddleware)
  .use(isAuthenticated);
export const adminProcedure = t.procedure.use(timingMiddleware).use(isAdmin);
export const reviewerProcedure = t.procedure
  .use(timingMiddleware)
  .use(isReviewerOrAdmin);
