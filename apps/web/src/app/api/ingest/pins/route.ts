/**
 * GET /api/ingest/pins?route=&since_ms=&reporter_anon=&reporter_id=
 *   Returns the caller's own pin reports for this project.
 *   Used by the SDK panel to seed the "Your reports" list across devices
 *   when localStorage is empty (private window, fresh browser, etc.).
 *
 * Auth: same `x-quad-key` SDK key + origin check as the rest of /api/ingest/*.
 * Authorization for who-can-see-what is strictly self-only:
 *   - reporter_id  → bug_reports.reporter_user_id matches
 *   - reporter_anon → bug_reports.reporter_anon_key matches
 *   At least one is required. We never return pins authored by anyone else.
 */
import { NextResponse } from "next/server";
import { and, desc, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "~/db";
import { authSdkRequest, withCors } from "~/lib/sdk-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Query = z.object({
  route: z.string().optional(),
  sinceMs: z.coerce.number().int().optional(),
  reporterAnon: z.string().optional(),
  reporterId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export async function OPTIONS(req: Request) {
  return withCors(req, [], new NextResponse(null, { status: 204 }));
}

export async function GET(req: Request) {
  const authResult = await authSdkRequest(req);
  if (!authResult.ok) {
    return withCors(
      req,
      [],
      NextResponse.json({ error: authResult.err.error }, { status: authResult.err.status }),
    );
  }
  const { project } = authResult.auth;

  const url = new URL(req.url);
  const params = Query.parse({
    route: url.searchParams.get("route") ?? undefined,
    sinceMs: url.searchParams.get("since_ms") ?? undefined,
    reporterAnon: url.searchParams.get("reporter_anon") ?? undefined,
    reporterId: url.searchParams.get("reporter_id") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });

  if (!params.reporterAnon && !params.reporterId) {
    return withCors(
      req,
      project.allowedOrigins,
      NextResponse.json({ error: "reporter_anon or reporter_id required" }, { status: 400 }),
    );
  }

  const conds = [
    eq(schema.bugReports.projectId, project.id),
    eq(schema.bugReports.kind, "pin" as const),
  ];
  if (params.reporterAnon) {
    conds.push(eq(schema.bugReports.reporterAnonKey, params.reporterAnon));
  } else if (params.reporterId) {
    conds.push(eq(schema.bugReports.reporterUserId, params.reporterId));
  }
  if (params.route) {
    conds.push(eq(schema.bugReports.targetRoute, params.route));
  }
  if (params.sinceMs) {
    conds.push(gt(schema.bugReports.createdAt, new Date(params.sinceMs)));
  }

  const rows = await db
    .select({
      id: schema.bugReports.id,
      createdAt: schema.bugReports.createdAt,
      route: schema.bugReports.targetRoute,
      pageUrl: schema.bugReports.pageUrl,
      selector: schema.bugReports.targetSelector,
      domPath: schema.bugReports.targetDomPath,
      componentPath: schema.bugReports.targetComponentPath,
      body: schema.bugReports.body,
      status: schema.bugReports.status,
    })
    .from(schema.bugReports)
    .where(and(...conds))
    .orderBy(desc(schema.bugReports.createdAt))
    .limit(params.limit);

  return withCors(
    req,
    project.allowedOrigins,
    NextResponse.json({ pins: rows }),
  );
}
