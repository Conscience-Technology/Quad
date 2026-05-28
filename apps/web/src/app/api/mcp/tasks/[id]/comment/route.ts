import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "~/db";
import { authMcpRequest, projectAllowed } from "~/lib/mcp-auth";
import { AZURE_DEVOPS_PROVIDER_ID } from "~/server/integrations/azure-devops";
import { getIssueProvider } from "~/server/integrations/registry";
import {
  credentialForProvider,
  getProjectIntegrationConfig,
  getTaskExternalIssue,
  providerConfigFromProject,
  upsertTaskExternalIssue,
} from "~/server/integrations/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  body: z.string().min(1).max(4_000),
  level: z.enum(["bug", "pin", "video"]).default("bug"),
  videoMs: z.number().int().min(0).optional(),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const r = await authMcpRequest(req);
  if (!r.ok) return NextResponse.json({ error: r.err.error }, { status: r.err.status });
  const { id } = await ctx.params;
  const payload = Body.parse(await req.json());

  const [task] = await db.select().from(schema.tasks).where(eq(schema.tasks.id, id)).limit(1);
  if (!task) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!projectAllowed(r.auth, task.projectId)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const [comment] = await db
    .insert(schema.comments)
    .values({
      bugReportId: task.bugReportId,
      level: payload.level,
      videoMs: payload.videoMs ?? null,
      authorKind: "builder",
      authorUserId: r.auth.user.id,
      body: payload.body,
    })
    .returning();
  let azureDevOps: Record<string, unknown> | undefined;
  let externalIssue: Record<string, unknown> | undefined;
  const linkedIssue =
    (await getTaskExternalIssue(task.id)) ??
    (task.azureWorkItemId
      ? {
          taskId: task.id,
          provider: AZURE_DEVOPS_PROVIDER_ID,
          externalId: String(task.azureWorkItemId),
          externalUrl: task.azureWorkItemUrl,
          title: null,
          state: null,
          syncStatus: "legacy",
          syncError: null,
          meta: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        }
      : null);
  if (linkedIssue) {
    const [project] = await db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, task.projectId))
      .limit(1);
    try {
      if (!project) throw new Error("Project not found");
      const provider = getIssueProvider(linkedIssue.provider);
      if (!provider) throw new Error(`Unknown provider: ${linkedIssue.provider}`);
      const integrationConfig = await getProjectIntegrationConfig(project.id, provider.id);
      const config = providerConfigFromProject(project, provider.id, integrationConfig);
      const credential = await credentialForProvider(provider, r.auth.user.id, config);
      await provider.addIssueComment({
        config,
        issueId: linkedIssue.externalId,
        markdown: `Quad builder comment:\n\n${payload.body}`,
        credentials: credential,
      });
      await upsertTaskExternalIssue({
        taskId: task.id,
        provider: provider.id,
        externalId: linkedIssue.externalId,
        externalUrl: linkedIssue.externalUrl,
        title: linkedIssue.title,
        state: linkedIssue.state,
        syncStatus: "synced",
        syncError: null,
      });
      if (provider.id === AZURE_DEVOPS_PROVIDER_ID) {
        azureDevOps = { workItemId: Number(linkedIssue.externalId), synced: true };
      }
      externalIssue = {
        provider: provider.id,
        id: linkedIssue.externalId,
        synced: true,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await upsertTaskExternalIssue({
        taskId: task.id,
        provider: linkedIssue.provider,
        externalId: linkedIssue.externalId,
        externalUrl: linkedIssue.externalUrl,
        title: linkedIssue.title,
        state: linkedIssue.state,
        syncStatus: "failed",
        syncError: message,
      });
      azureDevOps = {
        workItemId: task.azureWorkItemId ?? Number(linkedIssue.externalId),
        synced: false,
        error: message,
      };
      externalIssue = {
        provider: linkedIssue.provider,
        id: linkedIssue.externalId,
        synced: false,
        error: message,
      };
    }
  }
  await db.insert(schema.taskEvents).values({
    taskId: task.id,
    kind: "comment_added",
    actorUserId: r.auth.user.id,
    actorApiKeyId: r.auth.apiKey.id,
    payload: { commentId: comment?.id, azureDevOps, externalIssue },
  });
  return NextResponse.json({ id: comment?.id, externalIssue });
}
