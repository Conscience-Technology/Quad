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
  formatAzureMention,
  getAzureDevOpsPatForUser,
  getAzureWorkItem,
  isAzureDevOpsConfigured,
  searchAzureIdentities,
  setAzureWorkItemState,
  updateAzureWorkItemState,
} from "~/lib/azure-devops";
import { getBytes, presignDownload } from "~/lib/storage";
import { AZURE_DEVOPS_PROVIDER_ID } from "~/server/integrations/azure-devops";
import {
  externalIssuePayload,
  getAzureDevOpsConfig,
  getTaskExternalIssue,
  upsertTaskExternalIssue,
} from "~/server/integrations/store";
import { projectMemberProcedure } from "../auth-procedures";
import { router } from "../trpc";

const TaskStatuses = ["to_do", "in_progress", "reviewed", "resolved", "published", "done", "canceled"] as const;
const StatusFilter = z.enum([...TaskStatuses, "all"]).default("to_do");
const SetStatus = z.enum(TaskStatuses);

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
      const [briefUrl, markdownBytes, events, externalIssue] = await Promise.all([
        presignDownload(task.briefStorageKey, 300),
        getBytes(task.briefStorageKey).catch(() => null),
        ctx.db
          .select()
          .from(schema.taskEvents)
          .where(eq(schema.taskEvents.taskId, task.id))
          .orderBy(asc(schema.taskEvents.createdAt)),
        getTaskExternalIssue(task.id, AZURE_DEVOPS_PROVIDER_ID),
      ]);
      const markdown = markdownBytes ? Buffer.from(markdownBytes).toString("utf8") : null;
      return {
        task: { ...task, externalIssue: externalIssuePayload(task, externalIssue) },
        briefUrl,
        markdown,
        events,
      };
    }),

  searchAzureIdentities: projectMemberProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        query: z.string().trim().min(2).max(80),
      }),
    )
    .query(async ({ ctx, input }) => {
      const [project] = await ctx.db
        .select()
        .from(schema.projects)
        .where(eq(schema.projects.id, input.projectId))
        .limit(1);
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      const azureDevOpsConfig = await getAzureDevOpsConfig(project);
      const azurePat = await getAzureDevOpsPatForUser(ctx.user.id, azureDevOpsConfig?.organization);
      if (!isAzureDevOpsConfigured(azureDevOpsConfig, azurePat)) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Azure DevOps is not configured for this project, or your Azure DevOps PAT is missing.",
        });
      }
      return searchAzureIdentities(azureDevOpsConfig, input.query, azurePat);
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
        (await getAzureDevOpsConfig(project))?.organization,
      );
      const azureDevOpsConfig = await getAzureDevOpsConfig(project);
      if (!isAzureDevOpsConfigured(azureDevOpsConfig, azurePat)) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Azure DevOps is not configured for this project, or your Azure DevOps PAT is missing.",
        });
      }

      const workItem = await getAzureWorkItem(azureDevOpsConfig, input.workItemId, azurePat);
      const url = workItem?.url ?? azureWorkItemUrl(azureDevOpsConfig!, input.workItemId);
      const reportState = azureDevOpsConfig?.reportState?.trim() || "Reopened";
      const syncedState = await setAzureWorkItemState(
        azureDevOpsConfig,
        input.workItemId,
        reportState,
        azurePat,
      );

      await ctx.db
        .update(schema.tasks)
        .set({
          azureWorkItemId: input.workItemId,
          azureWorkItemUrl: url,
          updatedAt: new Date(),
        })
        .where(eq(schema.tasks.id, task.id));
      await upsertTaskExternalIssue({
        taskId: task.id,
        provider: AZURE_DEVOPS_PROVIDER_ID,
        externalId: input.workItemId,
        externalUrl: url,
        title: workItem?.title,
        state: syncedState,
        syncStatus: "synced",
        meta: { previousState: workItem?.state },
      });
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
          previousState: workItem?.state,
          state: syncedState,
        },
      });

      await addAzureWorkItemComment(
        azureDevOpsConfig,
        input.workItemId,
        `Linked to Quad task ${task.id}: ${task.title}`,
        azurePat,
      );

      return { ok: true, workItem, url };
    }),

  addAzureComment: projectMemberProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        taskId: z.string().uuid(),
        body: z.string().trim().min(1).max(4_000),
        mentions: z
          .array(
            z.object({
              id: z.string().min(1),
              displayName: z.string().optional(),
              uniqueName: z.string().optional(),
            }),
          )
          .max(10)
          .default([]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [task] = await ctx.db
        .select()
        .from(schema.tasks)
        .where(and(eq(schema.tasks.id, input.taskId), eq(schema.tasks.projectId, input.projectId)))
        .limit(1);
      if (!task) throw new TRPCError({ code: "NOT_FOUND" });
      if (!task.azureWorkItemId) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Link an Azure Work Item before posting an Azure comment.",
        });
      }

      const [project] = await ctx.db
        .select()
        .from(schema.projects)
        .where(eq(schema.projects.id, input.projectId))
        .limit(1);
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });

      const azureDevOpsConfig = await getAzureDevOpsConfig(project);
      const azurePat = await getAzureDevOpsPatForUser(ctx.user.id, azureDevOpsConfig?.organization);
      if (!isAzureDevOpsConfigured(azureDevOpsConfig, azurePat)) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Azure DevOps is not configured for this project, or your Azure DevOps PAT is missing.",
        });
      }

      const mentionMarkdown = input.mentions
        .map((mention) => formatAzureMention(mention.id))
        .join(" ");
      const markdown = [
        mentionMarkdown,
        `Quad comment from ${ctx.user.email}:`,
        input.body,
      ]
        .filter(Boolean)
        .join("\n\n");

      await addAzureWorkItemComment(
        azureDevOpsConfig,
        task.azureWorkItemId,
        markdown,
        azurePat,
      );

      const [comment] = await ctx.db
        .insert(schema.comments)
        .values({
          bugReportId: task.bugReportId,
          level: "bug",
          authorKind: "member",
          authorUserId: ctx.user.id,
          body: input.body,
        })
        .returning();

      const linkedExternalIssue = await getTaskExternalIssue(task.id, AZURE_DEVOPS_PROVIDER_ID);
      await upsertTaskExternalIssue({
        taskId: task.id,
        provider: AZURE_DEVOPS_PROVIDER_ID,
        externalId: task.azureWorkItemId,
        externalUrl: linkedExternalIssue?.externalUrl ?? task.azureWorkItemUrl,
        title: linkedExternalIssue?.title,
        state: linkedExternalIssue?.state,
        syncStatus: "synced",
        syncError: null,
        meta: {
          lastCommentId: comment?.id,
          mentions: input.mentions.map((mention) => ({
            id: mention.id,
            displayName: mention.displayName,
            uniqueName: mention.uniqueName,
          })),
        },
      });
      await ctx.db.insert(schema.taskEvents).values({
        taskId: task.id,
        kind: "comment_added",
        actorUserId: ctx.user.id,
        payload: {
          commentId: comment?.id,
          azureDevOps: { workItemId: task.azureWorkItemId, synced: true },
          mentions: input.mentions,
        },
      });

      return { ok: true, commentId: comment?.id };
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
        const azureDevOpsConfig = project ? await getAzureDevOpsConfig(project) : null;
        const azurePat = await getAzureDevOpsPatForUser(
          ctx.user.id,
          azureDevOpsConfig?.organization,
        );
        const mappedState = await updateAzureWorkItemState(
          azureDevOpsConfig,
          task.azureWorkItemId,
          input.status,
          azurePat,
        );
        if (mappedState) {
          if (!task.azureWorkItemId) throw new Error("Azure Work Item is not linked");
          const lines = [
            `Quad task status changed to \`${input.status}\` → Azure DevOps state \`${mappedState}\`.`,
            input.prUrl ? `PR: ${input.prUrl}` : "",
            input.note ? `Note: ${input.note}` : "",
          ].filter(Boolean);
          await addAzureWorkItemComment(
            azureDevOpsConfig,
            task.azureWorkItemId,
            lines.join("\n\n"),
            azurePat,
          );
          await upsertTaskExternalIssue({
            taskId: task.id,
            provider: AZURE_DEVOPS_PROVIDER_ID,
            externalId: task.azureWorkItemId,
            externalUrl: task.azureWorkItemUrl,
            state: mappedState,
            syncStatus: "synced",
            syncError: null,
          });
          azureDevOps = { workItemId: task.azureWorkItemId, state: mappedState, synced: true };
        }
      } catch (err) {
        if (task.azureWorkItemId) {
          await upsertTaskExternalIssue({
            taskId: task.id,
            provider: AZURE_DEVOPS_PROVIDER_ID,
            externalId: task.azureWorkItemId,
            externalUrl: task.azureWorkItemUrl,
            syncStatus: "failed",
            syncError: err instanceof Error ? err.message : String(err),
          });
        }
        azureDevOps = {
          workItemId: task.azureWorkItemId,
          synced: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
      await ctx.db.insert(schema.taskEvents).values({
        taskId: task.id,
        kind: input.status === "reviewed" ? "pr_attached" : "status_changed",
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
