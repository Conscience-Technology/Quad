/**
 * POST /api/mcp/sourcemaps — register a release + presign a batch of upload
 * URLs. Used by `quad sourcemap upload --release <sha> --project <slug> <dir>`.
 *
 * Body: { projectSlug, release, files: [{ relpath, sizeBytes, contentType }] }
 * Response: { uploads: [{ relpath, key, url, fields }] }
 *
 * Files land under: sourcemaps/<projectId>/<release>/<relpath>
 */
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "~/db";
import { authMcpRequest, projectAllowed } from "~/lib/mcp-auth";
import { presignUpload } from "~/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  projectSlug: z.string(),
  release: z.string().min(1).max(80),
  files: z
    .array(
      z.object({
        relpath: z.string().min(1).max(300),
        sizeBytes: z.number().int().positive().max(20 * 1024 * 1024),
        contentType: z.string().default("application/octet-stream"),
      }),
    )
    .min(1)
    .max(200),
});

export async function POST(req: Request) {
  const r = await authMcpRequest(req);
  if (!r.ok) return NextResponse.json({ error: r.err.error }, { status: r.err.status });

  const input = Body.parse(await req.json());

  const [project] = await db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.slug, input.projectSlug))
    .limit(1);
  if (!project) return NextResponse.json({ error: "project not found" }, { status: 404 });
  if (!projectAllowed(r.auth, project.id)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const safeRelease = input.release.replace(/[^A-Za-z0-9._-]/g, "_");

  const uploads = await Promise.all(
    input.files.map(async (f) => {
      const safe = f.relpath.replace(/\.\.+/g, "_").replace(/[^A-Za-z0-9._/-]/g, "_");
      const key = `sourcemaps/${project.id}/${safeRelease}/${safe}`;
      const sign = await presignUpload({
        key,
        contentType: f.contentType,
        maxSizeBytes: f.sizeBytes,
        expiresInSeconds: 60 * 30,
      });
      return { relpath: f.relpath, key, url: sign.url, fields: sign.fields };
    }),
  );

  await db.insert(schema.auditLog).values({
    whoKind: "mcp_key",
    whoId: r.auth.apiKey.id,
    action: "sourcemap.register",
    target: project.id,
    meta: { release: safeRelease, count: uploads.length },
  });

  return NextResponse.json({ uploads, release: safeRelease, projectId: project.id });
}
