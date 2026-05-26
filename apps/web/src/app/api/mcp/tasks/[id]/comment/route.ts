import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "~/db";
import { authMcpRequest, projectAllowed } from "~/lib/mcp-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  body: z.string().min(1).max(4_000),
  level: z.enum(["bug", "pin", "video"]).default("bug"),
  videoMs: z.number().int().min(0).optional(),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const r = await authMcpRequest(req);
  if (!r.ok) return NextResponse.json({ error: r.err.error }, { status: r.err.status });
  const { id } = await ctx.params;
  const payload = Body.parse(await req.json());

  const [task] = await db.select().from(schema.tasks).where(eq(schema.tasks.id, id)).limit(1);
  if (!task) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!projectAllowed(r.auth, task.projectId)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const [comment] = await db
    .insert(schema.comments)
    .values({
      bugReportId: task.bugReportId,
      level: payload.level,
      videoMs: payload.videoMs ?? null,
      authorKind: "builder",
      authorUserId: r.auth.user.id,
      body: payload.body,
    })
    .returning();
  await db.insert(schema.taskEvents).values({
    taskId: task.id,
    kind: "comment_added",
    actorUserId: r.auth.user.id,
    actorApiKeyId: r.auth.apiKey.id,
    payload: { commentId: comment?.id },
  });
  return NextResponse.json({ id: comment?.id });
}
