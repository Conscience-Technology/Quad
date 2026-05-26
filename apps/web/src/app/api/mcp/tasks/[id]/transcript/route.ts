/**
 * GET /api/mcp/tasks/:id/transcript
 *   Returns the Whisper transcript (text + segment timestamps) for the
 *   video/audio attached to this task's bug, if any.
 */
import { NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";
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

  const atts = await db
    .select({ id: schema.attachments.id })
    .from(schema.attachments)
    .where(eq(schema.attachments.bugReportId, task.bugReportId));
  const parentIds = atts.map((a) => a.id);
  if (parentIds.length === 0) return NextResponse.json({ transcript: null });

  const [transcript] = await db
    .select()
    .from(schema.transcripts)
    .where(inArray(schema.transcripts.attachmentId, parentIds))
    .limit(1);

  if (!transcript) return NextResponse.json({ transcript: null });
  return NextResponse.json({
    transcript: {
      text: transcript.text,
      language: transcript.language,
      provider: transcript.provider,
      segments: transcript.segments,
    },
  });
}
