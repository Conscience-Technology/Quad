import { NextResponse } from "next/server";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "~/db";
import { authMcpRequest } from "~/lib/mcp-auth";
import { env } from "~/lib/env";
import { listIssueProviders } from "~/server/integrations/registry";
import {
  credentialForProvider,
  getProjectIntegrationConfig,
  providerConfigFromProject,
} from "~/server/integrations/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const startedAt = Date.now();
  const r = await authMcpRequest(req);
  if (!r.ok) return NextResponse.json({ error: r.err.error }, { status: r.err.status });

  const projectIds = r.auth.user.isSuperAdmin
    ? (await db.select({ id: schema.projects.id }).from(schema.projects)).map((p) => p.id)
    : r.auth.projectIds;

  const projects = projectIds.length
    ? await db
        .select({
          id: schema.projects.id,
          slug: schema.projects.slug,
          name: schema.projects.name,
          azureDevOps: schema.projects.azureDevOps,
        })
        .from(schema.projects)
        .where(inArray(schema.projects.id, projectIds))
    : [];

  const [taskCounts] = projectIds.length
    ? await db
        .select({
          total: sql<number>`count(*)::int`,
          to_do: sql<number>`count(*) filter (where ${schema.tasks.status} = 'to_do')::int`,
          in_progress: sql<number>`count(*) filter (where ${schema.tasks.status} = 'in_progress')::int`,
          staleInProgress: sql<number>`count(*) filter (where ${schema.tasks.status} = 'in_progress' and ${schema.tasks.leaseExpiresAt} is not null and ${schema.tasks.leaseExpiresAt} < now())::int`,
        })
        .from(schema.tasks)
        .where(inArray(schema.tasks.projectId, projectIds))
    : [{ total: 0, to_do: 0, in_progress: 0, staleInProgress: 0 }];

  const scopedProjects = r.auth.user.isSuperAdmin
    ? "all"
    : projectIds.length;

  const integrations = await Promise.all(
    projects.flatMap((project) =>
      listIssueProviders().map(async (provider) => {
        const integrationConfig = await getProjectIntegrationConfig(project.id, provider.id);
        const config = providerConfigFromProject(project, provider.id, integrationConfig);
        const credentials = await credentialForProvider(provider, r.auth.user.id, config);
        const enabled = (config as { enabled?: boolean } | null | undefined)?.enabled === true;
        return {
          project: { id: project.id, slug: project.slug, name: project.name },
          provider: provider.id,
          enabled,
          configured: provider.isConfigured(config, credentials),
          credentialSource: credentials ? "configured" : "missing",
          nextAction:
            enabled && !credentials
              ? `Save a personal credential in Account -> MCP keys or set ${provider.envCredentialName ?? "the provider env token"}.`
              : null,
        };
      }),
    ),
  );

  const checks = [
    { name: "auth", ok: true, message: `MCP key accepted for ${r.auth.user.email}` },
    {
      name: "project_scope",
      ok: projects.length > 0,
      message: projects.length > 0
        ? `${scopedProjects} project scope available`
        : "No projects are available to this MCP key",
    },
    {
      name: "to_do_tasks",
      ok: (taskCounts?.to_do ?? 0) > 0,
      message: `${taskCounts?.to_do ?? 0} To Do task(s), ${taskCounts?.in_progress ?? 0} in_progress task(s), ${taskCounts?.staleInProgress ?? 0} stale lease(s)`,
    },
    {
      name: "issue_integrations",
      ok: integrations.every((i) => !i.enabled || i.configured),
      message: integrations.some((i) => i.enabled)
        ? "Enabled issue integrations checked"
        : "No enabled issue integration",
    },
  ];

  await db
    .update(schema.apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(and(eq(schema.apiKeys.id, r.auth.apiKey.id), eq(schema.apiKeys.scope, "mcp")));

  return NextResponse.json({
    ok: checks.every((check) => check.ok),
    endpoint: env().API_URL,
    user: { id: r.auth.user.id, email: r.auth.user.email, superAdmin: r.auth.user.isSuperAdmin },
    apiKey: {
      id: r.auth.apiKey.id,
      label: r.auth.apiKey.label,
      prefix: r.auth.apiKey.prefix,
      expiresAt: r.auth.apiKey.expiresAt,
      projectScope: scopedProjects,
    },
    checks,
    projects: projects.map((project) => ({
      id: project.id,
      slug: project.slug,
      name: project.name,
    })),
    taskCounts: taskCounts ?? { total: 0, to_do: 0, in_progress: 0, staleInProgress: 0 },
    integrations,
    durationMs: Date.now() - startedAt,
  });
}
