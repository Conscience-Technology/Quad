/**
 * Tasks router. Tasks are derived from bugs at Confirm time; from this point
 * on, Claude Code is the primary consumer via MCP. The dashboard mostly
 * mirrors task state for visibility + manual overrides.
 */
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { schema } from "~/db";
import { getBytes, presignDownload } from "~/lib/storage";
import { projectMemberProcedure } from "../auth-procedures";
import { router } from "../trpc";

const StatusFilter = z.enum(["queued", "picked", "in_progress", "pr_open", "done", "wont_do", "all"]).default("queued");
const SetStatus = z.enum(["queued", "picked", "in_progress", "pr_open", "done", "wont_do"]);

export const tasksRouter = router({
  list: projectMemberProcedure
    .input(z.object({ projectId: z.string().uuid(), status: StatusFilter }))
    .query(async ({ ctx, input }) => {
      const where =
        input.status === "all"
          ? eq(schema.tasks.projectId, input.projectId)
          : and(eq(schema.tasks.projectId, input.projectId), eq(schema.tasks.status, input.status));
      return ctx.db
        .select({
          id: schema.tasks.id,
          status: schema.tasks.status,
          title: schema.tasks.title,
          prUrl: schema.tasks.prUrl,
          createdAt: schema.tasks.createdAt,
          updatedAt: schema.tasks.updatedAt,
          bugReportId: schema.tasks.bugReportId,
        })
        .from(schema.tasks)
        .where(where)
        .orderBy(desc(schema.tasks.updatedAt));
    }),

  byId: projectMemberProcedure
    .input(z.object({ projectId: z.string().uuid(), taskId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [task] = await ctx.db
        .select()
        .from(schema.tasks)
        .where(and(eq(schema.tasks.id, input.taskId), eq(schema.tasks.projectId, input.projectId)))
        .limit(1);
      if (!task) throw new TRPCError({ code: "NOT_FOUND" });
      const [briefUrl, markdownBytes, events] = await Promise.all([
        presignDownload(task.briefStorageKey, 300),
        getBytes(task.briefStorageKey).catch(() => null),
        ctx.db
          .select()
          .from(schema.taskEvents)
          .where(eq(schema.taskEvents.taskId, task.id))
          .orderBy(asc(schema.taskEvents.createdAt)),
      ]);
      const markdown = markdownBytes ? Buffer.from(markdownBytes).toString("utf8") : null;
      return { task, briefUrl, markdown, events };
    }),

  updateStatus: projectMemberProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        taskId: z.string().uuid(),
        status: SetStatus,
        prUrl: z.string().url().optional(),
        note: z.string().max(2_000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [task] = await ctx.db
        .select()
        .from(schema.tasks)
        .where(and(eq(schema.tasks.id, input.taskId), eq(schema.tasks.projectId, input.projectId)))
        .limit(1);
      if (!task) throw new TRPCError({ code: "NOT_FOUND" });

      const patch: Record<string, unknown> = { status: input.status, updatedAt: new Date() };
      if (input.prUrl) patch.prUrl = input.prUrl;

      await ctx.db.update(schema.tasks).set(patch).where(eq(schema.tasks.id, task.id));
      await ctx.db.insert(schema.taskEvents).values({
        taskId: task.id,
        kind: input.status === "pr_open" ? "pr_attached" : "status_changed",
        actorUserId: ctx.user.id,
        payload: { status: input.status, prUrl: input.prUrl, note: input.note },
      });

      // When a task is marked done, mark the underlying bug as resolved.
      if (input.status === "done") {
        await ctx.db
          .update(schema.bugReports)
          .set({ status: "resolved", updatedAt: new Date() })
          .where(eq(schema.bugReports.id, task.bugReportId));
      }
      return { ok: true };
    }),
});
