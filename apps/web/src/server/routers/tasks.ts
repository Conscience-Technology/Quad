/**
 * Tasks router. Tasks are derived from bugs at Confirm time; from this point
 * on, Claude Code is the primary consumer via MCP. The dashboard mostly
 * mirrors task state for visibility + manual overrides.
 */
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { schema } from "~/db";
import {
  addAzureWorkItemComment,
  azureWorkItemUrl,
  getAzureDevOpsPatForUser,
  getAzureWorkItem,
  isAzureDevOpsConfigured,
  updateAzureWorkItemState,
} from "~/lib/azure-devops";
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
          azureWorkItemId: schema.tasks.azureWorkItemId,
          azureWorkItemUrl: schema.tasks.azureWorkItemUrl,
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

  linkAzureWorkItem: projectMemberProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        taskId: z.string().uuid(),
        workItemId: z.number().int().positive(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [task] = await ctx.db
        .select()
        .from(schema.tasks)
        .where(and(eq(schema.tasks.id, input.taskId), eq(schema.tasks.projectId, input.projectId)))
        .limit(1);
      if (!task) throw new TRPCError({ code: "NOT_FOUND" });

      const [project] = await ctx.db
        .select()
        .from(schema.projects)
        .where(eq(schema.projects.id, input.projectId))
        .limit(1);
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      const azurePat = await getAzureDevOpsPatForUser(
        ctx.user.id,
        project.azureDevOps?.organization,
      );
      if (!isAzureDevOpsConfigured(project.azureDevOps, azurePat)) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Azure DevOps is not configured for this project, or your Azure DevOps PAT is missing.",
        });
      }

      const workItem = await getAzureWorkItem(project.azureDevOps, input.workItemId, azurePat);
      const url = workItem?.url ?? azureWorkItemUrl(project.azureDevOps!, input.workItemId);

      await ctx.db
        .update(schema.tasks)
        .set({
          azureWorkItemId: input.workItemId,
          azureWorkItemUrl: url,
          updatedAt: new Date(),
        })
        .where(eq(schema.tasks.id, task.id));
      await ctx.db.insert(schema.taskEvents).values({
        taskId: task.id,
        kind: "status_changed",
        actorUserId: ctx.user.id,
        payload: {
          integration: "azure-devops",
          action: "linked",
          workItemId: input.workItemId,
          url,
          title: workItem?.title,
          state: workItem?.state,
        },
      });

      await addAzureWorkItemComment(
        project.azureDevOps,
        input.workItemId,
        `Linked to Quad task ${task.id}: ${task.title}`,
        azurePat,
      );

      return { ok: true, workItem, url };
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

      const [project] = await ctx.db
        .select()
        .from(schema.projects)
        .where(eq(schema.projects.id, task.projectId))
        .limit(1);
      let azureDevOps: Record<string, unknown> | undefined;
      try {
        const azurePat = await getAzureDevOpsPatForUser(
          ctx.user.id,
          project?.azureDevOps?.organization,
        );
        const mappedState = await updateAzureWorkItemState(
          project?.azureDevOps,
          task.azureWorkItemId,
          input.status,
          azurePat,
        );
        if (mappedState) {
          const lines = [
            `Quad task status changed to \`${input.status}\` → Azure DevOps state \`${mappedState}\`.`,
            input.prUrl ? `PR: ${input.prUrl}` : "",
            input.note ? `Note: ${input.note}` : "",
          ].filter(Boolean);
          await addAzureWorkItemComment(
            project?.azureDevOps,
            task.azureWorkItemId,
            lines.join("\n\n"),
            azurePat,
          );
          azureDevOps = { workItemId: task.azureWorkItemId, state: mappedState, synced: true };
        }
      } catch (err) {
        azureDevOps = {
          workItemId: task.azureWorkItemId,
          synced: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
      await ctx.db.insert(schema.taskEvents).values({
        taskId: task.id,
        kind: input.status === "pr_open" ? "pr_attached" : "status_changed",
        actorUserId: ctx.user.id,
        payload: { status: input.status, prUrl: input.prUrl, note: input.note, azureDevOps },
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
