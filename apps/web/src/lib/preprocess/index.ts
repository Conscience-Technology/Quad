/**
 * Preprocessor entrypoint. Called fire-and-forget from the ingest endpoints
 * after a bug_report is inserted. Pipeline (deterministic, no AI beyond
 * Whisper STT):
 *
 *   1. Pull video/audio attachments from the bucket
 *   2. Run FFmpeg to extract keyframes (evenly + pin times)
 *   3. Run FFmpeg to extract audio -> Whisper (when OPENAI_API_KEY is set)
 *   4. Read the SDK event-trail JSON attachment (if any)
 *   5. Merge into timeline.json
 *   6. Persist: attachments (kind=frame) + transcripts + a top-level timeline
 *      JSON stored as kind=timeline
 *
 * Errors don't bubble — they're logged + persisted to audit_log. The bug
 * report is still usable without preprocessing.
 */
import { eq } from "drizzle-orm";
import { db, schema } from "~/db";
import { getBytes, putBytes } from "~/lib/storage";
import { extractAudio, extractKeyframes, probeDurationMs } from "./ffmpeg";
import { mergeTimeline } from "./timeline";
import { transcribe } from "./whisper";

export async function processBugReport(bugReportId: string): Promise<void> {
  try {
    await processInner(bugReportId);
  } catch (err) {
    await db.insert(schema.auditLog).values({
      whoKind: "system",
      whoId: bugReportId,
      action: "preprocess.failed",
      target: bugReportId,
      meta: { message: err instanceof Error ? err.message : String(err) },
    });
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.error("[preprocess] failed:", err);
    }
  }
}

async function processInner(bugReportId: string): Promise<void> {
  const bugRows = await db
    .select()
    .from(schema.bugReports)
    .where(eq(schema.bugReports.id, bugReportId))
    .limit(1);
  const bug = bugRows[0];
  if (!bug) return;

  const atts = await db
    .select()
    .from(schema.attachments)
    .where(eq(schema.attachments.bugReportId, bugReportId));

  const video = atts.find((a) => a.kind === "video");
  const audio = atts.find((a) => a.kind === "audio");
  // Trail JSON is uploaded as kind=screenshot with mime application/json
  // (Capture session writes it that way to reuse the presign path).
  const trailAtt = atts.find(
    (a) => a.kind === "screenshot" && a.mime === "application/json",
  );

  // 1. Trail
  let trail: { events: Array<Record<string, unknown>>; durationMs?: number } | null = null;
  if (trailAtt) {
    try {
      const bytes = await getBytes(trailAtt.storageKey);
      trail = JSON.parse(Buffer.from(bytes).toString("utf8"));
    } catch { /* skip */ }
  }

  // 2. Video duration + keyframes
  const frames: Array<{ tMs: number; storageKey: string }> = [];
  if (video) {
    try {
      const videoBytes = await getBytes(video.storageKey);
      const durationMs = await probeDurationMs(videoBytes);
      if (durationMs > 0) {
        await db
          .update(schema.attachments)
          .set({ durationMs })
          .where(eq(schema.attachments.id, video.id));
      }
      const pinTimes = (trail?.events ?? [])
        .filter((e) => (e as { kind?: string }).kind === "pin_added")
        .map((e) => (e as { tMs?: number }).tMs ?? 0)
        .filter((t) => t > 0);
      const keyframes = await extractKeyframes(videoBytes, { count: 5, durationMs, pinTimes });
      for (const kf of keyframes) {
        const key = `bugs/${bugReportId}/frames/frame-${kf.tMs}.jpg`;
        await putBytes(key, kf.jpeg, "image/jpeg");
        const [row] = await db
          .insert(schema.attachments)
          .values({
            bugReportId,
            kind: "frame",
            storageKey: key,
            mime: "image/jpeg",
            sizeBytes: kf.jpeg.byteLength,
            tMs: kf.tMs,
            parentAttachmentId: video.id,
          })
          .returning();
        if (row) frames.push({ tMs: kf.tMs, storageKey: key });
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[preprocess] keyframes failed:", err);
    }
  }

  // 3. Audio -> Whisper. Use the explicit audio attachment if present;
  // otherwise extract from the video.
  let whisper = null as Awaited<ReturnType<typeof transcribe>>;
  try {
    let audioBytes: Uint8Array | null = null;
    let parentId = audio?.id ?? video?.id ?? null;
    if (audio) {
      audioBytes = await getBytes(audio.storageKey);
    } else if (video) {
      const videoBytes = await getBytes(video.storageKey);
      audioBytes = await extractAudio(videoBytes);
    }
    if (audioBytes && parentId) {
      whisper = await transcribe(audioBytes);
      if (whisper) {
        await db.insert(schema.transcripts).values({
          attachmentId: parentId,
          text: whisper.text,
          language: whisper.language ?? null,
          provider: "openai_whisper",
          segments: whisper.segments,
        });
      }
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[preprocess] whisper failed:", err);
  }

  // 4. Merge timeline
  const merged = mergeTimeline({ trail, whisper, meta: bug.meta, frames });
  const timelineKey = `bugs/${bugReportId}/timeline.json`;
  await putBytes(timelineKey, JSON.stringify(merged), "application/json");
  await db.insert(schema.attachments).values({
    bugReportId,
    kind: "timeline",
    storageKey: timelineKey,
    mime: "application/json",
    sizeBytes: Buffer.byteLength(JSON.stringify(merged)),
  });

  await db.insert(schema.auditLog).values({
    whoKind: "system",
    whoId: bugReportId,
    action: "preprocess.completed",
    target: bugReportId,
    meta: {
      frames: frames.length,
      transcriptSegments: whisper?.segments.length ?? 0,
      timelineEvents: merged.events.length,
    },
  });
}
