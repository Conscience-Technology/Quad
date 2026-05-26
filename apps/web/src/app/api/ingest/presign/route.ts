import { NextResponse } from "next/server";
import { z } from "zod";
import { presignUpload } from "~/lib/storage";
import { authSdkRequest, withCors } from "~/lib/sdk-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  filename: z.string().min(1).max(200),
  contentType: z.string().min(1).max(120),
  sizeBytes: z.number().int().positive(),
  kind: z.enum(["video", "audio", "screenshot"]),
});

const MAX_BYTES: Record<z.infer<typeof Body>["kind"], number> = {
  video: 500 * 1024 * 1024, // 500 MB
  audio: 100 * 1024 * 1024, // 100 MB
  screenshot: 10 * 1024 * 1024, // 10 MB
};

export async function OPTIONS(req: Request) {
  return withCors(req, [], new NextResponse(null, { status: 204 }));
}

export async function POST(req: Request) {
  const authResult = await authSdkRequest(req);
  if (!authResult.ok) {
    return withCors(
      req,
      [],
      NextResponse.json({ error: authResult.err.error }, { status: authResult.err.status }),
    );
  }
  const { project } = authResult.auth;

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch (err) {
    return withCors(
      req,
      project.allowedOrigins,
      NextResponse.json(
        { error: "invalid body", detail: String(err).slice(0, 200) },
        { status: 400 },
      ),
    );
  }

  if (body.sizeBytes > MAX_BYTES[body.kind]) {
    return withCors(
      req,
      project.allowedOrigins,
      NextResponse.json({ error: "file too large" }, { status: 413 }),
    );
  }

  const safeName = body.filename.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 80);
  const ext = safeName.includes(".") ? safeName.split(".").pop() : "";
  const ts = Date.now();
  const rand = crypto.randomUUID().slice(0, 8);
  const key = `projects/${project.id}/uploads/${ts}-${rand}${ext ? `.${ext}` : ""}`;

  try {
    const sign = await presignUpload({
      key,
      contentType: body.contentType,
      maxSizeBytes: body.sizeBytes,
      expiresInSeconds: 60 * 15, // 15 min
    });
    return withCors(req, project.allowedOrigins, NextResponse.json(sign));
  } catch (err) {
    return withCors(
      req,
      project.allowedOrigins,
      NextResponse.json(
        { error: "presign failed", detail: err instanceof Error ? err.message : "unknown" },
        { status: 500 },
      ),
    );
  }
}
