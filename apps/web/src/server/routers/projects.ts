/**
 * Projects router — list (mine), get, create, update, delete.
 */
import { TRPCError } from "@trpc/server";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { schema } from "~/db";
import { uniqueProjectSlug } from "~/lib/slug";
import {
  projectAdminProcedure,
  projectOwnerProcedure,
} from "../auth-procedures";
import { authedProcedure, router } from "../trpc";

const RepoSchema = z
  .object({
    provider: z.enum(["github", "gitlab", "local"]),
    owner: z.string().optional(),
    name: z.string().optional(),
    defaultBranch: z.string().optional(),
    pathPrefix: z.string().optional(),
  })
  .nullable();

export const projectsRouter = router({
  /** Projects the current user is an active member of (super admin sees all). */
  list: authedProcedure.query(async ({ ctx }) => {
    const memberCount = sql<number>`(SELECT count(*)::int FROM ${schema.projectMembers} WHERE ${schema.projectMembers.projectId} = ${schema.projects.id} AND ${schema.projectMembers.status} = 'active')`;
    const bugCount = sql<number>`(SELECT count(*)::int FROM ${schema.bugReports} WHERE ${schema.bugReports.projectId} = ${schema.projects.id})`;
    const openBugCount = sql<number>`(SELECT count(*)::int FROM ${schema.bugReports} WHERE ${schema.bugReports.projectId} = ${schema.projects.id} AND ${schema.bugReports.status} IN ('new','triaging'))`;

    if (ctx.user.isSuperAdmin) {
      return ctx.db
        .select({
          id: schema.projects.id,
          slug: schema.projects.slug,
          name: schema.projects.name,
          allowedOrigins: schema.projects.allowedOrigins,
          repo: schema.projects.repo,
          createdAt: schema.projects.createdAt,
          role: sql<"owner" | "admin" | "member">`'owner'`,
          memberCount,
          bugCount,
          openBugCount,
        })
        .from(schema.projects);
    }
    return ctx.db
      .select({
        id: schema.projects.id,
        slug: schema.projects.slug,
        name: schema.projects.name,
        allowedOrigins: schema.projects.allowedOrigins,
        repo: schema.projects.repo,
        createdAt: schema.projects.createdAt,
        role: schema.projectMembers.role,
        memberCount,
        bugCount,
        openBugCount,
      })
      .from(schema.projects)
      .innerJoin(
        schema.projectMembers,
        eq(schema.projectMembers.projectId, schema.projects.id),
      )
      .where(
        and(
          eq(schema.projectMembers.userId, ctx.user.id),
          eq(schema.projectMembers.status, "active"),
        ),
      );
  }),

  bySlug: authedProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select()
        .from(schema.projects)
        .where(eq(schema.projects.slug, input.slug))
        .limit(1);
      const project = rows[0];
      if (!project) throw new TRPCError({ code: "NOT_FOUND" });
      if (!ctx.user.isSuperAdmin) {
        const membership = await ctx.db
          .select({ status: schema.projectMembers.status })
          .from(schema.projectMembers)
          .where(
            and(
              eq(schema.projectMembers.projectId, project.id),
              eq(schema.projectMembers.userId, ctx.user.id),
            ),
          )
          .limit(1);
        if (!membership[0] || membership[0].status !== "active") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
      }
      return project;
    }),

  create: authedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(80),
        allowedOrigins: z.array(z.string().url()).default([]),
        repo: RepoSchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const slug = await uniqueProjectSlug(input.name);
      const [project] = await ctx.db
        .insert(schema.projects)
        .values({
          slug,
          name: input.name,
          allowedOrigins: input.allowedOrigins,
          repo: input.repo ?? null,
          createdByUserId: ctx.user.id,
        })
        .returning();
      if (!project) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await ctx.db.insert(schema.projectMembers).values({
        projectId: project.id,
        userId: ctx.user.id,
        role: "owner",
        status: "active",
        joinedAt: new Date(),
      });

      await ctx.db.insert(schema.auditLog).values({
        whoKind: ctx.user.isSuperAdmin ? "super_admin" : "user",
        whoId: ctx.user.id,
        action: "project.create",
        target: project.id,
        meta: { slug, name: input.name },
      });

      return project;
    }),

  update: projectAdminProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        name: z.string().min(1).max(80).optional(),
        allowedOrigins: z.array(z.string().url()).optional(),
        repo: RepoSchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      if (input.name !== undefined) patch.name = input.name;
      if (input.allowedOrigins !== undefined)
        patch.allowedOrigins = input.allowedOrigins;
      if (input.repo !== undefined) patch.repo = input.repo;

      const [updated] = await ctx.db
        .update(schema.projects)
        .set(patch)
        .where(eq(schema.projects.id, input.projectId))
        .returning();

      await ctx.db.insert(schema.auditLog).values({
        whoKind: "user",
        whoId: ctx.user.id,
        action: "project.update",
        target: input.projectId,
        meta: input,
      });

      return updated;
    }),

  delete: projectOwnerProcedure.mutation(async ({ ctx, input }) => {
    await ctx.db.delete(schema.projects).where(eq(schema.projects.id, input.projectId));
    await ctx.db.insert(schema.auditLog).values({
      whoKind: "user",
      whoId: ctx.user.id,
      action: "project.delete",
      target: input.projectId,
    });
    return { ok: true };
  }),
});
