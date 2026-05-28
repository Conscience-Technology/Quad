/**
 * POST /api/mcp/tasks/pick — claim the next queued task (or a specified one),
 * transitioning queued -> picked atomically.
 */
import { NextResponse } from "next/server";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "~/db";
import { authMcpRequest, projectAllowed } from "~/lib/mcp-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  projectId: z.string().uuid().optional(),
  taskId: z.string().uuid().optional(),
  leaseMs: z.number().int().min(60_000).max(86_400_000).optional(),
});

const DEFAULT_LEASE_MS = 30 * 60 * 1000;

export async function POST(req: Request) {
  const r = await authMcpRequest(req);
  if (!r.ok) return NextResponse.json({ error: r.err.error }, { status: r.err.status });
  const body = Body.parse(await req.json().catch(() => ({})));

  const projects = body.projectId
    ? [body.projectId]
    : r.auth.user.isSuperAdmin
      ? (await db.select({ id: schema.projects.id }).from(schema.projects)).map((p) => p.id)
      : r.auth.projectIds;
  if (projects.length === 0) {
    return NextResponse.json({ task: null, error: "no projects" }, { status: 404 });
  }
  if (body.projectId && !projectAllowed(r.auth, body.projectId)) {
    return NextResponse.json({ error: "forbidden project" }, { status: 403 });
  }

  const now = new Date();
  await db
    .update(schema.tasks)
    .set({
      status: "queued",
      claimedByUserId: null,
      claimedByApiKeyId: null,
      claimedAt: null,
      leaseExpiresAt: null,
      updatedAt: now,
    })
    .where(
      and(
        inArray(schema.tasks.projectId, projects),
        eq(schema.tasks.status, "picked"),
        sql`${schema.tasks.leaseExpiresAt} is not null`,
        sql`${schema.tasks.leaseExpiresAt} < ${now}`,
      ),
    );

  // Find the candidate task (specified or next queued in the allowed projects).
  let candidate: typeof schema.tasks.$inferSelect | undefined;
  if (body.taskId) {
    const rows = await db
      .select()
      .from(schema.tasks)
      .where(
        and(
          eq(schema.tasks.id, body.taskId),
          inArray(schema.tasks.projectId, projects),
          eq(schema.tasks.status, "queued"),
        ),
      )
      .limit(1);
    candidate = rows[0];
  } else {
    const rows = await db
      .select()
      .from(schema.tasks)
      .where(
        and(
          inArray(schema.tasks.projectId, projects),
          eq(schema.tasks.status, "queued"),
        ),
      )
      .limit(1);
    candidate = rows[0];
  }
  if (!candidate) {
    return NextResponse.json({ task: null });
  }

  // Best-effort atomic claim: status='picked' WHERE id=... AND status='queued'.
  const leaseExpiresAt = new Date(now.getTime() + (body.leaseMs ?? DEFAULT_LEASE_MS));
  const [claimed] = await db
    .update(schema.tasks)
    .set({
      status: "picked",
      claimedByUserId: r.auth.user.id,
      claimedByApiKeyId: r.auth.apiKey.id,
      claimedAt: now,
      leaseExpiresAt,
      updatedAt: now,
    })
    .where(and(eq(schema.tasks.id, candidate.id), eq(schema.tasks.status, "queued")))
    .returning();
  if (!claimed) {
    return NextResponse.json({ task: null, error: "race" });
  }

  await db.insert(schema.taskEvents).values({
    taskId: claimed.id,
    kind: "picked",
    actorUserId: r.auth.user.id,
    actorApiKeyId: r.auth.apiKey.id,
    payload: { leaseExpiresAt: leaseExpiresAt.toISOString() },
  });

  return NextResponse.json({
    task: {
      id: claimed.id,
      projectId: claimed.projectId,
      title: claimed.title,
      status: claimed.status,
      bugReportId: claimed.bugReportId,
      claimedAt: claimed.claimedAt,
      leaseExpiresAt: claimed.leaseExpiresAt,
    },
  });
}
