/**
 * GET /api/mcp/tasks/:id/frames?from_ms=&to_ms=&limit=
 *   Returns inline frames (base64) for the given task. Used when an agent
 *   needs more frames than `quad_get_task` inlined by default, or wants a
 *   specific time window.
 */
import { NextResponse } from "next/server";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { db, schema } from "~/db";
import { authMcpRequest, projectAllowed } from "~/lib/mcp-auth";
import { getBytes } from "~/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_INLINE = 12;
const MAX_PER_FRAME = 220_000;

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const r = await authMcpRequest(req);
  if (!r.ok) return NextResponse.json({ error: r.err.error }, { status: r.err.status });
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const fromMs = Number.parseInt(url.searchParams.get("from_ms") ?? "0", 10);
  const toMs = url.searchParams.get("to_ms")
    ? Number.parseInt(url.searchParams.get("to_ms")!, 10)
    : Number.MAX_SAFE_INTEGER;
  const limit = Math.min(
    MAX_INLINE,
    Math.max(1, Number.parseInt(url.searchParams.get("limit") ?? "6", 10)),
  );

  const [task] = await db.select().from(schema.tasks).where(eq(schema.tasks.id, id)).limit(1);
  if (!task) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!projectAllowed(r.auth, task.projectId)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const frames = await db
    .select()
    .from(schema.attachments)
    .where(
      and(
        eq(schema.attachments.bugReportId, task.bugReportId),
        eq(schema.attachments.kind, "frame"),
        gte(schema.attachments.tMs, fromMs),
        lte(schema.attachments.tMs, toMs),
      ),
    )
    .orderBy(asc(schema.attachments.tMs))
    .limit(limit);

  const out = await Promise.all(
    frames
      .filter((f) => f.sizeBytes <= MAX_PER_FRAME)
      .map(async (f) => ({
        tMs: f.tMs ?? 0,
        mime: f.mime,
        data: Buffer.from(await getBytes(f.storageKey)).toString("base64"),
      })),
  );
  return NextResponse.json({ frames: out });
}
