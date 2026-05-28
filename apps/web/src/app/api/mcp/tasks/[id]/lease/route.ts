import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "~/db";
import { authMcpRequest, projectAllowed } from "~/lib/mcp-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  leaseMs: z.number().int().min(60_000).max(86_400_000).default(30 * 60 * 1000),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const r = await authMcpRequest(req);
  if (!r.ok) return NextResponse.json({ error: r.err.error }, { status: r.err.status });
  const { id } = await ctx.params;
  const body = Body.parse(await req.json().catch(() => ({})));

  const [task] = await db.select().from(schema.tasks).where(eq(schema.tasks.id, id)).limit(1);
  if (!task) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!projectAllowed(r.auth, task.projectId)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (task.status !== "in_progress") {
    return NextResponse.json({ error: "task is not in_progress" }, { status: 400 });
  }

  const now = new Date();
  const leaseExpiresAt = new Date(now.getTime() + body.leaseMs);
  const [updated] = await db
    .update(schema.tasks)
    .set({
      claimedByUserId: r.auth.user.id,
      claimedByApiKeyId: r.auth.apiKey.id,
      claimedAt: task.claimedAt ?? now,
      leaseExpiresAt,
      updatedAt: now,
    })
    .where(and(eq(schema.tasks.id, task.id), eq(schema.tasks.status, "in_progress")))
    .returning();

  await db.insert(schema.taskEvents).values({
    taskId: task.id,
    kind: "picked",
    actorUserId: r.auth.user.id,
    actorApiKeyId: r.auth.apiKey.id,
    payload: { leaseRenewed: true, leaseExpiresAt: leaseExpiresAt.toISOString() },
  });

  return NextResponse.json({
    ok: true,
    task: {
      id: updated?.id ?? task.id,
      status: updated?.status ?? task.status,
      claimedAt: updated?.claimedAt ?? task.claimedAt,
      leaseExpiresAt: updated?.leaseExpiresAt ?? leaseExpiresAt,
    },
  });
}
