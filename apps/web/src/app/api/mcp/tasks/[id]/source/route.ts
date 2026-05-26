/**
 * GET /api/mcp/tasks/:id/source
 *   Returns the source pointer for the bug — selector, component path, and
 *   the file:line that was resolved by source-map (if uploaded). Lets agents
 *   know where in the host repo to look without fetching the whole brief.
 */
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "~/db";
import { authMcpRequest, projectAllowed } from "~/lib/mcp-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const r = await authMcpRequest(req);
  if (!r.ok) return NextResponse.json({ error: r.err.error }, { status: r.err.status });
  const { id } = await ctx.params;

  const [task] = await db.select().from(schema.tasks).where(eq(schema.tasks.id, id)).limit(1);
  if (!task) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!projectAllowed(r.auth, task.projectId)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const [bug] = await db
    .select()
    .from(schema.bugReports)
    .where(eq(schema.bugReports.id, task.bugReportId))
    .limit(1);
  if (!bug) return NextResponse.json({ error: "bug not found" }, { status: 404 });

  const [project] = await db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, task.projectId))
    .limit(1);

  return NextResponse.json({
    selector: bug.targetSelector,
    domPath: bug.targetDomPath,
    componentPath: bug.targetComponentPath,
    sourceLocation: bug.targetSourceLocation,
    route: bug.targetRoute,
    pageUrl: bug.pageUrl,
    bbox: bug.targetBbox,
    repo: project?.repo ?? null,
    commitSha: (bug.meta as { gitCommitSha?: string }).gitCommitSha,
  });
}
