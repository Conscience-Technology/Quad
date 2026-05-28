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
  providerConfigFromProject,
  upsertTaskExternalIssue,
} from "~/server/integrations/store";
import type { IssueProviderId } from "~/server/integrations/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  provider: z.string().default(AZURE_DEVOPS_PROVIDER_ID),
  issueId: z.union([z.number().int().positive(), z.string().min(1)]),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const r = await authMcpRequest(req);
  if (!r.ok) return NextResponse.json({ error: r.err.error }, { status: r.err.status });
  const { id } = await ctx.params;
  const body = Body.parse(await req.json());
  const providerId = body.provider as IssueProviderId;
  const provider = getIssueProvider(providerId);
  if (!provider) {
    return NextResponse.json({ error: "unknown provider" }, { status: 400 });
  }

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

  const integrationConfig = await getProjectIntegrationConfig(project.id, provider.id);
  const config = providerConfigFromProject(project, provider.id, integrationConfig);
  const credential = await credentialForProvider(provider, r.auth.user.id, config);
  if (!provider.isConfigured(config, credential)) {
    return NextResponse.json(
      {
        error: "integration credential missing",
        code: "INTEGRATION_CREDENTIAL_MISSING",
        nextAction: `Save a personal credential in Account -> MCP keys or set ${provider.envCredentialName ?? "the provider env token"}.`,
      },
      { status: 400 },
    );
  }

  const issue = await provider.getIssue({
    config,
    issueId: body.issueId,
    credentials: credential,
  });
  const issueId = issue?.id ?? body.issueId;
  const issueUrl = issue?.url ?? provider.issueUrl(config, issueId);
  const reportState = provider.reportState(config);
  const syncedState = await provider.setIssueState({
    config,
    issueId,
    state: reportState,
    credentials: credential,
  });

  const numericIssueId = Number(issueId);
  if (provider.id === AZURE_DEVOPS_PROVIDER_ID && Number.isFinite(numericIssueId)) {
    await db
      .update(schema.tasks)
      .set({
        azureWorkItemId: numericIssueId,
        azureWorkItemUrl: issueUrl,
        updatedAt: new Date(),
      })
      .where(eq(schema.tasks.id, task.id));
  } else {
    await db
      .update(schema.tasks)
      .set({ updatedAt: new Date() })
      .where(eq(schema.tasks.id, task.id));
  }

  await upsertTaskExternalIssue({
    taskId: task.id,
    provider: provider.id,
    externalId: issueId,
    externalUrl: issueUrl,
    title: issue?.title,
    state: syncedState ?? issue?.state,
    syncStatus: syncedState ? "synced" : "linked",
    meta: { previousState: issue?.state },
  });

  const externalIssue = {
    provider: provider.id,
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
