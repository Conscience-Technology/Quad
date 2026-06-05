import { NextResponse } from "next/server";
import { z } from "zod";
import { processBugReport } from "~/lib/preprocess";
import { authSdkRequest, withCors } from "~/lib/sdk-auth";
import { createSession } from "~/server/ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Attachment = z.object({
  key: z.string(),
  mime: z.string(),
  sizeBytes: z.number().int().positive(),
  kind: z.enum(["video", "audio", "screenshot"]),
});

const BBox = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
});

const SourceLocation = z.object({
  file: z.string().optional(),
  line: z.number().optional(),
  column: z.number().optional(),
  function: z.string().optional(),
});

const Target = z.object({
  selector: z.string(),
  domPath: z.string(),
  componentPath: z.string().optional(),
  sourceLocation: SourceLocation.optional(),
  bbox: BBox,
  route: z.string(),
  pageUrl: z.string(),
  outerHtmlPreview: z.string(),
  body: z.string(),
  label: z.string().max(200).optional(),
});

const Body = z.object({
  title: z.string().max(200),
  body: z.string().max(8000),
  meta: z.record(z.unknown()),
  reporter: z
    .object({
      id: z.string().optional(),
      email: z.string().email().optional(),
      name: z.string().optional(),
    })
    .optional(),
  reporterAnonKey: z.string().optional(),
  attachments: z.array(Attachment).max(20).optional(),
  target: Target.optional(),
});

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

  let payload: z.infer<typeof Body>;
  try {
    payload = Body.parse(await req.json());
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

  try {
    const result = await createSession({
      projectId: project.id,
      title: payload.title,
      body: payload.body,
      meta: payload.meta,
      reporter: payload.reporter,
      reporterAnonKey: payload.reporterAnonKey,
      attachments: payload.attachments,
      target: payload.target,
    });
    setImmediate(() => { void processBugReport(result.id); });
    return withCors(req, project.allowedOrigins, NextResponse.json(result));
  } catch (err) {
    return withCors(
      req,
      project.allowedOrigins,
      NextResponse.json(
        { error: "ingest failed", detail: err instanceof Error ? err.message : "unknown" },
        { status: 500 },
      ),
    );
  }
}
