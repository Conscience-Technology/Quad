/**
 * POST /api/mcp/bugs/:id/attach — attach an OS recording (or any file) to
 * an existing bug_report. Used by `quad attach <bug-id> <file>`. Returns a
 * presigned POST the CLI uploads to directly.
 *
 * Body: { filename, contentType, sizeBytes, kind }
 * Response: { upload: presignedPost, attachmentId } — CLI uploads, then
 * server creates the attachment row asynchronously via a second call.
 *
 * Simpler: just return the presign + create the attachment row immediately
 * (with the chosen storage key). The CLI follows up the upload — if it
 * fails, the row stays as a dangling pointer (low blast radius). Phase 2
 * can add a verification sweep.
 */
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "~/db";
import { authMcpRequest, projectAllowed } from "~/lib/mcp-auth";
import { processBugReport } from "~/lib/preprocess";
import { presignUpload } from "~/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  filename: z.string().min(1).max(200),
  contentType: z.string().min(1).max(120),
  sizeBytes: z.number().int().positive(),
  kind: z.enum(["video", "audio", "screenshot"]),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const r = await authMcpRequest(req);
  if (!r.ok) return NextResponse.json({ error: r.err.error }, { status: r.err.status });
  const { id } = await ctx.params;

  const [bug] = await db
    .select()
    .from(schema.bugReports)
    .where(eq(schema.bugReports.id, id))
    .limit(1);
  if (!bug) return NextResponse.json({ error: "bug not found" }, { status: 404 });
  if (!projectAllowed(r.auth, bug.projectId)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const input = Body.parse(await req.json());
  const ext = input.filename.includes(".") ? input.filename.split(".").pop() : "";
  const safe = input.filename.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 60);
  const key = `bugs/${bug.id}/attach-${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${safe}`;

  const sign = await presignUpload({
    key,
    contentType: input.contentType,
    maxSizeBytes: input.sizeBytes,
    expiresInSeconds: 60 * 30,
  });

  const [att] = await db
    .insert(schema.attachments)
    .values({
      bugReportId: bug.id,
      kind: input.kind,
      storageKey: key,
      mime: input.contentType,
      sizeBytes: input.sizeBytes,
    })
    .returning();

  // Re-trigger preprocessing once the upload completes (best-effort: scheduled
  // immediately, the worker reads the file once it's there).
  setTimeout(() => { void processBugReport(bug.id); }, 5_000);

  return NextResponse.json({
    attachmentId: att?.id,
    upload: sign,
  });
}
