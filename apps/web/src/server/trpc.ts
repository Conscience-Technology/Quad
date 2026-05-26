/**
 * tRPC v11 init + context.
 */
import { TRPCError, initTRPC } from "@trpc/server";
import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import superjson from "superjson";
import { ZodError } from "zod";
import { db } from "~/db";
import { getCurrentUser, type CurrentUser } from "~/lib/auth/current-user";

export type Context = {
  user: CurrentUser | null;
  db: typeof db;
  headers: Headers;
};

export async function createContext(
  opts: FetchCreateContextFnOptions,
): Promise<Context> {
  const user = await getCurrentUser();
  return { user, db, headers: opts.req.headers };
}

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodIssues:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;

export const authedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const superAdminProcedure = authedProcedure.use(({ ctx, next }) => {
  if (!ctx.user.isSuperAdmin) throw new TRPCError({ code: "FORBIDDEN" });
  return next({ ctx });
});
