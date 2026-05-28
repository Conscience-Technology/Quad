import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "~/db";
import { authMcpRequest, projectAllowed } from "~/lib/mcp-auth";
import {
  azureDevOpsProvider,
  AZURE_DEVOPS_PROVIDER_ID,
} from "~/server/integrations/azure-devops";
import { getUserIntegrationSecret } from "~/server/integrations/credentials";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  provider: z.literal(AZURE_DEVOPS_PROVIDER_ID).default(AZURE_DEVOPS_PROVIDER_ID),
  issueId: z.union([z.number().int().positive(), z.string().min(1)]),
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
  const [project] = await db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, task.projectId))
    .limit(1);
  if (!project) return NextResponse.json({ error: "project not found" }, { status: 404 });

  const pat = await getUserIntegrationSecret(
    AZURE_DEVOPS_PROVIDER_ID,
    r.auth.user.id,
    project.azureDevOps?.organization,
  );
  if (!azureDevOpsProvider.isConfigured(project.azureDevOps, pat)) {
    return NextResponse.json(
      {
        error: "integration credential missing",
        code: "INTEGRATION_CREDENTIAL_MISSING",
        nextAction: "Save a personal PAT in Account -> MCP keys or set AZURE_DEVOPS_PAT.",
      },
      { status: 400 },
    );
  }

  const issue = await azureDevOpsProvider.getIssue({
    config: project.azureDevOps,
    issueId: body.issueId,
    credentials: pat,
  });
  const issueId = Number(issue?.id ?? body.issueId);
  const issueUrl = issue?.url ?? azureDevOpsProvider.issueUrl(project.azureDevOps!, issueId);
  const reportState = azureDevOpsProvider.reportState(project.azureDevOps);
  const syncedState = await azureDevOpsProvider.setIssueState({
    config: project.azureDevOps,
    issueId,
    state: reportState,
    credentials: pat,
  });

  await db
    .update(schema.tasks)
    .set({
      azureWorkItemId: issueId,
      azureWorkItemUrl: issueUrl,
      updatedAt: new Date(),
    })
    .where(eq(schema.tasks.id, task.id));

  const externalIssue = {
    provider: body.provider,
    id: issueId,
    url: issueUrl,
    title: issue?.title,
    previousState: issue?.state,
    state: syncedState,
    synced: Boolean(syncedState),
  };
  await db.insert(schema.taskEvents).values({
    taskId: task.id,
    kind: "status_changed",
    actorUserId: r.auth.user.id,
    actorApiKeyId: r.auth.apiKey.id,
    payload: { externalIssue },
  });

  return NextResponse.json({ ok: true, externalIssue });
}
