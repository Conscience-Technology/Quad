/**
 * GET /api/mcp/tasks?status=to_do&project_id=&query=  — list/search tasks
 * POST /api/mcp/tasks/pick                             — pick next (project_id?, task_id?)
 */
import { NextResponse } from "next/server";
import { and, desc, eq, inArray, like, or } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "~/db";
import { authMcpRequest } from "~/lib/mcp-auth";
import { externalIssuePayload } from "~/server/integrations/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  status: z.enum(["to_do", "in_progress", "reviewed", "resolved", "published", "done", "canceled"]).optional(),
  projectId: z.string().uuid().optional(),
  query: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export async function GET(req: Request) {
  const r = await authMcpRequest(req);
  if (!r.ok) return NextResponse.json({ error: r.err.error }, { status: r.err.status });
  const url = new URL(req.url);
  const params = QuerySchema.parse({
    status: url.searchParams.get("status") ?? undefined,
    projectId: url.searchParams.get("project_id") ?? undefined,
    query: url.searchParams.get("query") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });

  const projects = params.projectId
    ? [params.projectId]
    : r.auth.user.isSuperAdmin
      ? (await db.select({ id: schema.projects.id }).from(schema.projects)).map((p) => p.id)
      : r.auth.projectIds;
  if (projects.length === 0) return NextResponse.json({ tasks: [] });

  const where = [inArray(schema.tasks.projectId, projects)];
  if (params.status) where.push(eq(schema.tasks.status, params.status));
  if (params.query) where.push(like(schema.tasks.title, `%${params.query}%`));

  const tasks = await db
    .select({
      id: schema.tasks.id,
      projectId: schema.tasks.projectId,
      status: schema.tasks.status,
      title: schema.tasks.title,
      prUrl: schema.tasks.prUrl,
      azureWorkItemId: schema.tasks.azureWorkItemId,
      azureWorkItemUrl: schema.tasks.azureWorkItemUrl,
      claimedAt: schema.tasks.claimedAt,
      leaseExpiresAt: schema.tasks.leaseExpiresAt,
      createdAt: schema.tasks.createdAt,
    })
    .from(schema.tasks)
    .where(and(...where))
    .orderBy(desc(schema.tasks.createdAt))
    .limit(params.limit);
  const issueRows = tasks.length
    ? await db
        .select()
        .from(schema.taskExternalIssues)
        .where(inArray(schema.taskExternalIssues.taskId, tasks.map((task) => task.id)))
    : [];
  const issueByTask = new Map(issueRows.map((issue) => [issue.taskId, issue]));

  return NextResponse.json({
    tasks: tasks.map((task) => ({
      ...task,
      externalIssue: externalIssuePayload(task, issueByTask.get(task.id)),
    })),
  });
}
