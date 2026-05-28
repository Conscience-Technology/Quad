import { NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "~/db";
import { env } from "~/lib/env";
import { authMcpRequest, projectAllowed } from "~/lib/mcp-auth";
import {
  azureDevOpsProvider,
  AZURE_DEVOPS_PROVIDER_ID,
} from "~/server/integrations/azure-devops";
import { getUserIntegrationSecret } from "~/server/integrations/credentials";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TestBody = z.object({
  projectId: z.string().uuid(),
  provider: z.literal(AZURE_DEVOPS_PROVIDER_ID).default(AZURE_DEVOPS_PROVIDER_ID),
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
    projects.map(async (project) => {
      const userPat = await getUserIntegrationSecret(
        AZURE_DEVOPS_PROVIDER_ID,
        r.auth.user.id,
        project.azureDevOps?.organization,
      );
      const serverPat = env().AZURE_DEVOPS_PAT;
      const credentials = userPat || serverPat;
      return {
        project: { id: project.id, slug: project.slug, name: project.name },
        provider: AZURE_DEVOPS_PROVIDER_ID,
        name: azureDevOpsProvider.name,
        enabled: project.azureDevOps?.enabled === true,
        configured: azureDevOpsProvider.isConfigured(project.azureDevOps, credentials),
        credentialSource: userPat ? "user" : serverPat ? "server" : "missing",
        organization: project.azureDevOps?.organization ?? null,
        projectName: project.azureDevOps?.project ?? null,
        reportState: azureDevOpsProvider.reportState(project.azureDevOps),
        stateMap: project.azureDevOps?.stateMap ?? null,
      };
    }),
  );

  return NextResponse.json({ integrations });
}

export async function POST(req: Request) {
  const r = await authMcpRequest(req);
  if (!r.ok) return NextResponse.json({ error: r.err.error }, { status: r.err.status });
  const body = TestBody.parse(await req.json());
  if (!projectAllowed(r.auth, body.projectId)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const [project] = await db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, body.projectId))
    .limit(1);
  if (!project) return NextResponse.json({ error: "project not found" }, { status: 404 });

  const userPat = await getUserIntegrationSecret(
    AZURE_DEVOPS_PROVIDER_ID,
    r.auth.user.id,
    project.azureDevOps?.organization,
  );
  const serverPat = env().AZURE_DEVOPS_PAT;
  const credentials = userPat || serverPat;
  if (!azureDevOpsProvider.isConfigured(project.azureDevOps, credentials)) {
    return NextResponse.json({
      ok: false,
      provider: AZURE_DEVOPS_PROVIDER_ID,
      credentialSource: "missing",
      message: "Azure DevOps config or credential is missing.",
      nextAction: "Save a personal PAT in Account -> MCP keys or set AZURE_DEVOPS_PAT.",
    });
  }

  try {
    if (body.issueId) {
      const issue = await azureDevOpsProvider.getIssue({
        config: project.azureDevOps,
        issueId: body.issueId,
        credentials,
      });
      return NextResponse.json({
        ok: true,
        provider: AZURE_DEVOPS_PROVIDER_ID,
        credentialSource: userPat ? "user" : "server",
        issue,
      });
    }
    const result = await azureDevOpsProvider.testConnection?.({
      config: project.azureDevOps,
      credentials,
    });
    return NextResponse.json({
      ok: true,
      provider: AZURE_DEVOPS_PROVIDER_ID,
      credentialSource: userPat ? "user" : "server",
      message: result?.message ?? "Connected.",
    });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      provider: AZURE_DEVOPS_PROVIDER_ID,
      credentialSource: userPat ? "user" : "server",
      message: err instanceof Error ? err.message : String(err),
      nextAction: "Check provider settings, token scope, project name, and issue id.",
    });
  }
}
