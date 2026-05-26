/**
 * Project-scoped procedures. Inputs must include `projectId`; the procedure
 * fetches the caller's membership and enforces role.
 */
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { schema } from "~/db";
import { authedProcedure } from "./trpc";

const ProjectInput = z.object({ projectId: z.string().uuid() });

async function loadMembership(
  db: typeof import("~/db").db,
  projectId: string,
  userId: string,
) {
  const rows = await db
    .select()
    .from(schema.projectMembers)
    .where(
      and(
        eq(schema.projectMembers.projectId, projectId),
        eq(schema.projectMembers.userId, userId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

function rank(role: "owner" | "admin" | "member"): number {
  return role === "owner" ? 3 : role === "admin" ? 2 : 1;
}

export const projectMemberProcedure = authedProcedure
  .input(ProjectInput)
  .use(async ({ ctx, input, next }) => {
    const membership = await loadMembership(ctx.db, input.projectId, ctx.user.id);
    if (
      (!membership || membership.status !== "active") &&
      !ctx.user.isSuperAdmin
    ) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Not a member of this project" });
    }
    return next({
      ctx: {
        ...ctx,
        membership: membership ?? {
          projectId: input.projectId,
          userId: ctx.user.id,
          role: "owner" as const,
          status: "active" as const,
          invitedByUserId: null,
          joinedAt: null,
          createdAt: new Date(),
        },
      },
    });
  });

export const projectAdminProcedure = projectMemberProcedure.use(({ ctx, next }) => {
  if (!ctx.user.isSuperAdmin && rank(ctx.membership.role) < rank("admin")) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin privileges required" });
  }
  return next({ ctx });
});

export const projectOwnerProcedure = projectMemberProcedure.use(({ ctx, next }) => {
  if (!ctx.user.isSuperAdmin && rank(ctx.membership.role) < rank("owner")) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Owner privileges required" });
  }
  return next({ ctx });
});
