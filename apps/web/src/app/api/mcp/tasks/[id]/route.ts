/**
 * GET /api/mcp/tasks/:id — full Task Brief: markdown body + frames as base64
 * (image content for the MCP client) + signed URLs for video/audio. No JSON
 * stays out of the bundle, so a vision-capable agent can act in one round.
 */
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "~/db";
import { authMcpRequest, projectAllowed } from "~/lib/mcp-auth";
import { getBytes, presignDownload } from "~/lib/storage";
import { externalIssuePayload, getTaskExternalIssue } from "~/server/integrations/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FRAMES_INLINED = 6;
const MAX_FRAME_BYTES = 220_000; // ~150KB target with a safety margin

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const r = await authMcpRequest(req);
  if (!r.ok) return NextResponse.json({ error: r.err.error }, { status: r.err.status });
  const { id } = await ctx.params;

  const [task] = await db
    .select()
    .from(schema.tasks)
    .where(eq(schema.tasks.id, id))
    .limit(1);
  if (!task) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!projectAllowed(r.auth, task.projectId)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Brief markdown
  const markdownBytes = await getBytes(task.briefStorageKey);
  const markdown = Buffer.from(markdownBytes).toString("utf8");

  // Frames (kind=frame) and standalone screenshot attachments for the same bug.
  // Screenshot-only reports do not produce video keyframes, but agents still
  // need the image content in the MCP response.
  const atts = await db
    .select()
    .from(schema.attachments)
    .where(eq(schema.attachments.bugReportId, task.bugReportId));
  const frames = atts
    .filter(
      (a) =>
        (a.kind === "frame" ||
          (a.kind === "screenshot" && a.mime.startsWith("image/"))) &&
        a.sizeBytes <= MAX_FRAME_BYTES,
    )
    .slice(0, MAX_FRAMES_INLINED);
  const video = atts.find((a) => a.kind === "video");
  const audio = atts.find((a) => a.kind === "audio");
  const timeline = atts.find((a) => a.kind === "timeline");

  const inlineFrames = await Promise.all(
    frames.map(async (f) => {
      const bytes = await getBytes(f.storageKey);
      return {
        tMs: f.tMs ?? 0,
        mime: f.mime,
        kind: f.kind,
        data: Buffer.from(bytes).toString("base64"),
      };
    }),
  );

  const videoUrl = video ? await presignDownload(video.storageKey, 600) : undefined;
  const audioUrl = audio ? await presignDownload(audio.storageKey, 600) : undefined;
  const timelineText = timeline
    ? Buffer.from(await getBytes(timeline.storageKey)).toString("utf8")
    : undefined;
  const externalIssue = await getTaskExternalIssue(task.id);

  return NextResponse.json({
    task: {
      id: task.id,
      projectId: task.projectId,
      bugReportId: task.bugReportId,
      title: task.title,
      status: task.status,
      maintainerInstruction: task.maintainerInstruction,
      prUrl: task.prUrl,
      azureWorkItemId: task.azureWorkItemId,
      azureWorkItemUrl: task.azureWorkItemUrl,
      claimedAt: task.claimedAt,
      leaseExpiresAt: task.leaseExpiresAt,
      externalIssue: externalIssuePayload(task, externalIssue),
    },
    markdown,
    frames: inlineFrames,
    timelineJson: timelineText,
    videoUrl,
    audioUrl,
  });
}
