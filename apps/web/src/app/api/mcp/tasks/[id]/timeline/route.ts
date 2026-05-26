/**
 * GET /api/mcp/tasks/:id/timeline?kinds=click,console,network
 *   Returns the merged timeline.json (event stream aligned across video /
 *   audio / DOM / console / network). Optional `kinds` filter trims the
 *   payload before sending — useful when the bundle has hundreds of events
 *   but the agent only cares about a few categories.
 */
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "~/db";
import { authMcpRequest, projectAllowed } from "~/lib/mcp-auth";
import { getBytes } from "~/lib/storage";

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

  const url = new URL(req.url);
  const kindsParam = url.searchParams.get("kinds");
  const filter = kindsParam
    ? new Set(kindsParam.split(",").map((s) => s.trim()).filter(Boolean))
    : null;

  const [timelineAtt] = await db
    .select()
    .from(schema.attachments)
    .where(
      and(
        eq(schema.attachments.bugReportId, task.bugReportId),
        eq(schema.attachments.kind, "timeline"),
      ),
    )
    .limit(1);
  if (!timelineAtt) return NextResponse.json({ timeline: null });

  try {
    const text = Buffer.from(await getBytes(timelineAtt.storageKey)).toString("utf8");
    const parsed = JSON.parse(text) as {
      version: number;
      durationMs: number;
      events: Array<{ kind: string }>;
    };
    if (filter) {
      parsed.events = parsed.events.filter((e) => filter.has(e.kind));
    }
    return NextResponse.json({ timeline: parsed });
  } catch (err) {
    return NextResponse.json(
      { error: "timeline parse failed", detail: err instanceof Error ? err.message : "unknown" },
      { status: 500 },
    );
  }
}
