import { NextResponse } from "next/server";
import { z } from "zod";
import { processBugReport } from "~/lib/preprocess";
import { authSdkRequest, withCors } from "~/lib/sdk-auth";
import { createPin } from "~/server/ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

const Feedback = z.object({
  type: z.string().max(200).optional(),
  feature: z.string().max(200).optional(),
  userStory: z.string().max(200).optional(),
  location: z.string().max(4000).optional(),
  currentSpec: z.string().max(8000).optional(),
  intendedSpec: z.string().max(8000).optional(),
  reporter: z.string().max(200).optional(),
  comment: z.string().max(8000).optional(),
  reportedAt: z.string().optional(),
});

const Body = z.object({
  pin: z.object({
    selector: z.string(),
    domPath: z.string(),
    componentPath: z.string().optional(),
    sourceLocation: SourceLocation.optional(),
    bbox: BBox,
    route: z.string(),
    pageUrl: z.string(),
    outerHtmlPreview: z.string(),
    body: z.string(),
  }),
  meta: z.record(z.unknown()),
  reporter: z
    .object({
      id: z.string().optional(),
      email: z.string().email().optional(),
      name: z.string().optional(),
    })
    .optional(),
  reporterAnonKey: z.string().optional(),
  feedback: Feedback.optional(),
});

export async function OPTIONS(req: Request) {
  // Pre-flight has no auth context yet -> minimal headers; the actual POST
  // resolves the project + allowedOrigins.
  return withCors(
    req,
    [],
    new NextResponse(null, { status: 204 }),
  );
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
    const result = await createPin({
      projectId: project.id,
      pin: payload.pin,
      meta: payload.meta,
      reporter: payload.reporter,
      reporterAnonKey: payload.reporterAnonKey,
      feedback: payload.feedback,
    });
    // fire-and-forget preprocessing (pin bugs have no video, but Whisper /
    // timeline merge still produces a sane bundle for the maintainer + agent)
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
