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
  status: z.enum(["to_do", "in_progress", "reviewed", "resolved", "published", "done", "canceled"]),
  prUrl: z.string().url().optional(),
  note: z.string().max(2_000).optional(),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const r = await authMcpRequest(req);
  if (!r.ok) return NextResponse.json({ error: r.err.error }, { status: r.err.status });
  const { id } = await ctx.params;
  const body = Body.parse(await req.json());

  const [task] = await db.select().from(schema.tasks).where(eq(schema.tasks.id, id)).limit(1);
  if (!task) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!projectAllowed(r.auth, task.projectId)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const patch: Record<string, unknown> = { status: body.status, updatedAt: new Date() };
  if (body.prUrl) patch.prUrl = body.prUrl;
  await db.update(schema.tasks).set(patch).where(eq(schema.tasks.id, task.id));

  const [project] = await db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, task.projectId))
    .limit(1);
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
  if (linkedIssue && project) {
    const provider = getIssueProvider(linkedIssue.provider);
    try {
      if (!provider) throw new Error(`Unknown provider: ${linkedIssue.provider}`);
      const integrationConfig = await getProjectIntegrationConfig(project.id, provider.id);
      const config = providerConfigFromProject(project, provider.id, integrationConfig);
      const credential = await credentialForProvider(provider, r.auth.user.id, config);
      const mappedState = await provider.updateIssueForTaskStatus({
        config,
        issueId: linkedIssue.externalId,
        status: body.status,
        credentials: credential,
      });
      if (!mappedState) throw new Error(`${provider.name} status mapping is not configured`);
      const lines = [
        `Quad task status changed to \`${body.status}\` → ${provider.name} state \`${mappedState}\`.`,
        body.prUrl ? `PR: ${body.prUrl}` : "",
        body.note ? `Note: ${body.note}` : "",
      ].filter(Boolean);
      await provider.addIssueComment({
        config,
        issueId: linkedIssue.externalId,
        markdown: lines.join("\n\n"),
        credentials: credential,
      });
      await upsertTaskExternalIssue({
        taskId: task.id,
        provider: provider.id,
        externalId: linkedIssue.externalId,
        externalUrl: linkedIssue.externalUrl,
        title: linkedIssue.title,
        state: mappedState,
        syncStatus: "synced",
        syncError: null,
      });
      if (provider.id === AZURE_DEVOPS_PROVIDER_ID) {
        azureDevOps = { workItemId: Number(linkedIssue.externalId), state: mappedState, synced: true };
      }
      externalIssue = {
        provider: provider.id,
        id: linkedIssue.externalId,
        state: mappedState,
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
      if (linkedIssue.provider === AZURE_DEVOPS_PROVIDER_ID) {
        azureDevOps = {
          workItemId: Number(linkedIssue.externalId),
          synced: false,
          error: message,
        };
      }
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
    kind: body.status === "reviewed" ? "pr_attached" : "status_changed",
    actorUserId: r.auth.user.id,
    actorApiKeyId: r.auth.apiKey.id,
    payload: { status: body.status, prUrl: body.prUrl, note: body.note, azureDevOps, externalIssue },
  });
  if (body.status === "done") {
    await db
      .update(schema.bugReports)
      .set({ status: "resolved", updatedAt: new Date() })
      .where(eq(schema.bugReports.id, task.bugReportId));
  }
  return NextResponse.json({ ok: true, externalIssue });
}
