import { NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "~/db";
import { authMcpRequest, projectAllowed } from "~/lib/mcp-auth";
import {
  AZURE_DEVOPS_PROVIDER_ID,
} from "~/server/integrations/azure-devops";
import { getIssueProvider, listIssueProviders } from "~/server/integrations/registry";
import {
  credentialForProvider,
  getProjectIntegrationConfig,
  providerConfigFromProject,
} from "~/server/integrations/store";
import type { IssueProviderId } from "~/server/integrations/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TestBody = z.object({
  projectId: z.string().uuid(),
  provider: z.string().default(AZURE_DEVOPS_PROVIDER_ID),
  issueId: z.union([z.number().int().positive(), z.string().min(1)]).optional(),
});

export async function GET(req: Request) {
  const r = await authMcpRequest(req);
  if (!r.ok) return NextResponse.json({ error: r.err.error }, { status: r.err.status });

  const url = new URL(req.url);
  const requestedProjectId = url.searchParams.get("project_id") ?? undefined;
  const projectIds = requestedProjectId
    ? [requestedProjectId]
    : r.auth.user.isSuperAdmin
      ? (await db.select({ id: schema.projects.id }).from(schema.projects)).map((p) => p.id)
      : r.auth.projectIds;

  if (requestedProjectId && !projectAllowed(r.auth, requestedProjectId)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (projectIds.length === 0) return NextResponse.json({ integrations: [] });

  const projects = await db
    .select({
      id: schema.projects.id,
      slug: schema.projects.slug,
      name: schema.projects.name,
      azureDevOps: schema.projects.azureDevOps,
    })
    .from(schema.projects)
    .where(inArray(schema.projects.id, projectIds));

  const integrations = await Promise.all(
    projects.flatMap((project) =>
      listIssueProviders().map(async (provider) => {
        const integrationConfig = await getProjectIntegrationConfig(project.id, provider.id);
        const config = providerConfigFromProject(project, provider.id, integrationConfig);
        const credentials = await credentialForProvider(provider, r.auth.user.id, config);
        return {
          project: { id: project.id, slug: project.slug, name: project.name },
          provider: provider.id,
          name: provider.name,
          enabled: (config as { enabled?: boolean } | null | undefined)?.enabled === true,
          configured: provider.isConfigured(config, credentials),
          credentialSource: credentials ? "configured" : "missing",
          config,
          reportState: provider.reportState(config),
          stateMap: (config as { stateMap?: unknown } | null | undefined)?.stateMap ?? null,
        };
      }),
    ),
  );

  return NextResponse.json({ integrations });
}

export async function POST(req: Request) {
  const r = await authMcpRequest(req);
  if (!r.ok) return NextResponse.json({ error: r.err.error }, { status: r.err.status });
  const body = TestBody.parse(await req.json());
  const providerId = body.provider as IssueProviderId;
  const provider = getIssueProvider(providerId);
  if (!provider) {
    return NextResponse.json({ ok: false, provider: body.provider, message: "Unknown provider" }, { status: 400 });
  }
  if (!projectAllowed(r.auth, body.projectId)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const [project] = await db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, body.projectId))
    .limit(1);
  if (!project) return NextResponse.json({ error: "project not found" }, { status: 404 });

  const integrationConfig = await getProjectIntegrationConfig(project.id, provider.id);
  const config = providerConfigFromProject(project, provider.id, integrationConfig);
  const credentials = await credentialForProvider(provider, r.auth.user.id, config);
  if (!provider.isConfigured(config, credentials)) {
    return NextResponse.json({
      ok: false,
      provider: provider.id,
      credentialSource: "missing",
      message: `${provider.name} config or credential is missing.`,
      nextAction: `Save a personal credential in Account -> MCP keys or set ${provider.envCredentialName ?? "the provider env token"}.`,
    });
  }

  try {
    if (body.issueId) {
      const issue = await provider.getIssue({
        config,
        issueId: body.issueId,
        credentials,
      });
      return NextResponse.json({
        ok: true,
        provider: provider.id,
        credentialSource: credentials ? "configured" : "missing",
        issue,
      });
    }
    const result = await provider.testConnection?.({
      config,
      credentials,
    });
    return NextResponse.json({
      ok: true,
      provider: provider.id,
      credentialSource: credentials ? "configured" : "missing",
      message: result?.message ?? "Connected.",
    });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      provider: provider.id,
      credentialSource: credentials ? "configured" : "missing",
      message: err instanceof Error ? err.message : String(err),
      nextAction: "Check provider settings, token scope, project name, and issue id.",
    });
  }
}
