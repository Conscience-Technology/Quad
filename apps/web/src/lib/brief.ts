/**
 * Task Brief generator. Frozen at Confirm time — once a bug becomes a task,
 * the brief is a self-contained markdown bundle that Claude Code can consume
 * via MCP without further lookups.
 *
 * No AI here — pure deterministic projection of the existing DB rows.
 * Size caps per spec section 6.2.
 */
import { asc, eq, inArray } from "drizzle-orm";
import { db, schema } from "~/db";
import type { BugMeta } from "~/db/schema";
import {
  addAzureWorkItemComment,
  azureWorkItemUrl,
  getAzureDevOpsPatForUser,
  isAzureDevOpsConfigured,
} from "./azure-devops";
import { putBytes } from "./storage";

const MAX_BRIEF_BYTES = 8 * 1024;
const MAX_CONSOLE = 50;
const MAX_NETWORK = 20;

export type TaskBriefManifest = {
  markdownKey: string;
  frames: Array<{ storageKey: string; tMs: number }>;
  timelineKey?: string;
  transcriptKey?: string;
  attachments: Array<{
    kind: "video" | "audio" | "screenshot" | "frame" | "timeline" | "brief";
    storageKey: string;
    mime: string;
    sizeBytes: number;
    durationMs?: number | null;
    tMs?: number | null;
  }>;
};

export async function buildTaskBrief(input: {
  bugReportId: string;
  maintainerInstruction?: string;
  confirmedByUserId: string;
}): Promise<{ taskId: string; manifest: TaskBriefManifest }> {
  const bugRows = await db
    .select()
    .from(schema.bugReports)
    .where(eq(schema.bugReports.id, input.bugReportId))
    .limit(1);
  const bug = bugRows[0];
  if (!bug) throw new Error("bug_report not found");

  const projectRows = await db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, bug.projectId))
    .limit(1);
  const project = projectRows[0];
  if (!project) throw new Error("project not found");
  const azureWorkItemId = readAzureWorkItemId(bug.meta);
  const linkedAzureWorkItemUrl =
    azureWorkItemId && project.azureDevOps ? azureWorkItemUrl(project.azureDevOps, azureWorkItemId) : null;

  const [atts, comments, occurrences] = await Promise.all([
    db
      .select()
      .from(schema.attachments)
      .where(eq(schema.attachments.bugReportId, input.bugReportId))
      .orderBy(asc(schema.attachments.tMs)),
    db
      .select()
      .from(schema.comments)
      .where(eq(schema.comments.bugReportId, input.bugReportId))
      .orderBy(asc(schema.comments.createdAt)),
    db
      .select()
      .from(schema.bugOccurrences)
      .where(eq(schema.bugOccurrences.bugReportId, input.bugReportId)),
  ]);

  const video = atts.find((a) => a.kind === "video");
  const audio = atts.find((a) => a.kind === "audio");
  const frames = atts.filter((a) => a.kind === "frame");
  const timelineAtt = atts.find((a) => a.kind === "timeline");

  let transcript: typeof schema.transcripts.$inferSelect | null = null;
  if (video || audio) {
    const parentIds = [video?.id, audio?.id].filter((x): x is string => !!x);
    if (parentIds.length > 0) {
      const trows = await db
        .select()
        .from(schema.transcripts)
        .where(inArray(schema.transcripts.attachmentId, parentIds))
        .limit(1);
      transcript = trows[0] ?? null;
    }
  }

  const md = renderMarkdown({
    bug,
    project,
    atts,
    comments,
    occurrences,
    video,
    audio,
    frames,
    transcript,
    maintainerInstruction: input.maintainerInstruction,
  });

  const briefBytes = Buffer.from(truncate(md, MAX_BRIEF_BYTES), "utf8");
  const briefKey = `bugs/${bug.id}/brief.md`;
  await putBytes(briefKey, briefBytes, "text/markdown; charset=utf-8");
  const [briefAtt] = await db
    .insert(schema.attachments)
    .values({
      bugReportId: bug.id,
      kind: "brief",
      storageKey: briefKey,
      mime: "text/markdown; charset=utf-8",
      sizeBytes: briefBytes.byteLength,
    })
    .returning();

  const manifest: TaskBriefManifest = {
    markdownKey: briefKey,
    frames: frames.slice(0, 6).map((f) => ({ storageKey: f.storageKey, tMs: f.tMs ?? 0 })),
    timelineKey: timelineAtt?.storageKey,
    transcriptKey: undefined, // transcript text inlined in the markdown
    attachments: [...atts, ...(briefAtt ? [briefAtt] : [])].map((a) => ({
      kind: a.kind,
      storageKey: a.storageKey,
      mime: a.mime,
      sizeBytes: a.sizeBytes,
      durationMs: a.durationMs,
      tMs: a.tMs,
    })),
  };

  const [task] = await db
    .insert(schema.tasks)
    .values({
      projectId: bug.projectId,
      bugReportId: bug.id,
      status: "queued",
      title: bug.title,
      maintainerInstruction: input.maintainerInstruction ?? null,
      azureWorkItemId,
      azureWorkItemUrl: linkedAzureWorkItemUrl,
      briefStorageKey: briefKey,
      bundleManifest: {
        markdown: briefKey,
        frames: manifest.frames,
        timelineJson: timelineAtt?.storageKey ?? "",
        sourceMd: undefined,
      },
      confirmedByUserId: input.confirmedByUserId,
    })
    .returning();
  if (!task) throw new Error("task insert failed");

  await db.insert(schema.taskEvents).values({
    taskId: task.id,
    kind: "created",
    actorUserId: input.confirmedByUserId,
    payload: { fromBugReport: bug.id, briefSizeBytes: briefBytes.byteLength },
  });

  if (azureWorkItemId) {
    try {
      const pat = await getAzureDevOpsPatForUser(
        input.confirmedByUserId,
        project.azureDevOps?.organization,
      );
      if (isAzureDevOpsConfigured(project.azureDevOps, pat)) {
        await addAzureWorkItemComment(
          project.azureDevOps,
          azureWorkItemId,
          `Linked to Quad task ${task.id}: ${bug.title}`,
          pat,
        );
        await db.insert(schema.taskEvents).values({
          taskId: task.id,
          kind: "comment_added",
          actorUserId: input.confirmedByUserId,
          payload: {
            integration: "azure-devops",
            action: "linked_from_report",
            workItemId: azureWorkItemId,
          },
        });
      }
    } catch (err) {
      await db.insert(schema.taskEvents).values({
        taskId: task.id,
        kind: "comment_added",
        actorUserId: input.confirmedByUserId,
        payload: {
          integration: "azure-devops",
          action: "linked_from_report",
          workItemId: azureWorkItemId,
          error: err instanceof Error ? err.message : "Azure DevOps comment sync failed",
        },
      });
    }
  }

  await db
    .update(schema.bugReports)
    .set({ status: "confirmed", updatedAt: new Date() })
    .where(eq(schema.bugReports.id, bug.id));

  return { taskId: task.id, manifest };
}

// ---- markdown renderer -----------------------------------------------------

function renderMarkdown(args: {
  bug: typeof schema.bugReports.$inferSelect;
  project: typeof schema.projects.$inferSelect;
  atts: Array<typeof schema.attachments.$inferSelect>;
  comments: Array<typeof schema.comments.$inferSelect>;
  occurrences: Array<typeof schema.bugOccurrences.$inferSelect>;
  video: typeof schema.attachments.$inferSelect | undefined;
  audio: typeof schema.attachments.$inferSelect | undefined;
  frames: Array<typeof schema.attachments.$inferSelect>;
  transcript: typeof schema.transcripts.$inferSelect | null;
  maintainerInstruction?: string;
}): string {
  const { bug, project, atts, comments, occurrences, video, audio, frames, transcript, maintainerInstruction } = args;
  const meta: BugMeta = bug.meta;
  const out: string[] = [];

  out.push(`# Task: ${bug.title}`);
  out.push("");
  if (maintainerInstruction) {
    out.push(`## Summary`, maintainerInstruction, "");
  } else {
    out.push(`## Summary`, bug.body || "(no body)", "");
  }

  // Origin
  const reporter = bug.reporterIdentify
    ? bug.reporterIdentify.email ?? bug.reporterIdentify.id ?? "anon"
    : bug.reporterAnonKey ?? "anon";
  const requestedAzureWorkItemId = readAzureWorkItemId(meta);
  out.push(
    `## Origin`,
    `- Reporter: ${reporter}`,
    `- Reported at: ${bug.createdAt.toISOString()}`,
    `- Project: ${project.slug}`,
    `- Route: ${bug.targetRoute ?? ""}`,
    `- URL: ${bug.pageUrl ?? ""}`,
    `- Commit at report time: ${(meta as unknown as Record<string, string>).gitCommitSha ?? "(unknown)"}`,
    ...(requestedAzureWorkItemId ? [`- Azure Work Item: #${requestedAzureWorkItemId}`] : []),
    occurrences.length > 0 ? `- Occurrences: ${occurrences.length + 1} (1 primary + ${occurrences.length} more)` : `- Occurrences: 1`,
    "",
  );

  // Reporter's words
  if (bug.body) {
    out.push(`## Reporter's words`, `> ${bug.body.replace(/\n/g, "\n> ")}`, "");
  }

  // Target element (only for pin kind)
  if (bug.targetSelector || bug.targetSourceLocation) {
    out.push(`## Target element`);
    if (bug.targetSelector) out.push(`- Selector: \`${bug.targetSelector}\``);
    if (bug.targetDomPath) out.push(`- DOM path: \`${bug.targetDomPath}\``);
    if (bug.targetComponentPath) out.push(`- Component path: \`${bug.targetComponentPath}\``);
    if (bug.targetSourceLocation?.file) {
      const loc = bug.targetSourceLocation;
      out.push(
        `- Source: \`${loc.file}${loc.line ? `:${loc.line}` : ""}${loc.column ? `:${loc.column}` : ""}\``,
      );
      if (loc.function) out.push(`- Function: \`${loc.function}\``);
    }
    if (bug.targetBbox) {
      const b = bug.targetBbox;
      out.push(`- BBox: { x: ${b.x}, y: ${b.y}, w: ${b.w}, h: ${b.h} }`);
    }
    out.push("");
  }

  // Video / audio (signed URLs are resolved by the MCP server at fetch time,
  // not embedded here; the brief just lists storage keys).
  if (video || audio) {
    out.push(`## Recording`);
    if (video) out.push(`- Video: ${video.storageKey} (${video.durationMs ?? "?"} ms)`);
    if (audio) out.push(`- Audio: ${audio.storageKey} (${audio.durationMs ?? "?"} ms)`);
    out.push("");
  }

  // Transcript
  if (transcript && transcript.segments.length > 0) {
    out.push(`## Transcript`);
    for (const s of transcript.segments) {
      const t = formatMs(s.startMs);
      out.push(`- [${t}] ${s.text}`);
    }
    out.push("");
  }

  // Key frames
  if (frames.length > 0) {
    out.push(`## Key frames`);
    for (const f of frames.slice(0, 6)) {
      out.push(`- ${formatMs(f.tMs ?? 0)} — ${f.storageKey}`);
    }
    out.push("");
  }

  // Comments
  if (comments.length > 0) {
    out.push(`## Comments`);
    for (const c of comments.slice(0, 40)) {
      const who = c.authorKind === "reporter" ? "Reporter" : c.authorKind === "builder" ? "Builder" : "Maintainer";
      const lvl = c.level === "video" && c.videoMs != null ? ` @${formatMs(c.videoMs)}` : "";
      out.push(`- **${who}**${lvl}: ${c.body.slice(0, 500)}`);
    }
    out.push("");
  }

  // Environment
  out.push(
    `## Environment`,
    `- UA: ${meta.userAgent ?? ""}`,
    `- Viewport: ${meta.viewport ? `${meta.viewport.w}x${meta.viewport.h}` : ""}`,
    `- DPR: ${meta.devicePixelRatio ?? ""}`,
    `- TZ: ${meta.timezone ?? ""}`,
    `- SDK: ${meta.sdkVersion ?? ""}`,
    "",
  );

  // Console
  const logs = (meta.consoleLogs ?? []).slice(-MAX_CONSOLE);
  if (logs.length > 0) {
    out.push(`## Console (${logs.length})`);
    out.push("```");
    for (const l of logs) {
      out.push(`[${formatMs(l.tMs)}] ${l.level}: ${l.message.slice(0, 200)}`);
    }
    out.push("```", "");
  }

  // Network
  const net = (meta.networkErrors ?? []).slice(-MAX_NETWORK);
  if (net.length > 0) {
    out.push(`## Network errors (${net.length})`);
    for (const n of net) {
      out.push(
        `- ${formatMs(n.tMs)} \`${n.method} ${truncateMid(n.url, 80)} ${n.status ?? ""}\`${n.bodyPreview ? ` — ${n.bodyPreview.slice(0, 120)}` : ""}`,
      );
    }
    out.push("");
  }

  // Attachments index
  out.push(`## Attachments`);
  for (const a of atts) {
    out.push(`- ${a.kind} · ${a.mime} · ${a.sizeBytes}B · ${a.storageKey}`);
  }
  out.push("");

  out.push(
    `---`,
    `(Generated by Quad. Update task status via MCP: quad_update_task. No AI hypothesis was produced server-side — reason it through yourself from the raw context above.)`,
  );

  return out.join("\n");
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0
    ? `${m}:${String(s % 60).padStart(2, "0")}`
    : `${s}.${String(ms % 1000).padStart(3, "0")}s`;
}

function truncate(s: string, max: number): string {
  if (Buffer.byteLength(s, "utf8") <= max) return s;
  // Binary search a safe cut point.
  let lo = 0, hi = s.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (Buffer.byteLength(s.slice(0, mid), "utf8") <= max - 16) lo = mid;
    else hi = mid - 1;
  }
  return `${s.slice(0, lo)}\n\n…(truncated)`;
}

function truncateMid(s: string, max: number): string {
  if (s.length <= max) return s;
  const half = Math.floor((max - 3) / 2);
  return `${s.slice(0, half)}...${s.slice(-half)}`;
}

function readAzureWorkItemId(meta: BugMeta): number | null {
  const customContext = meta.customContext;
  if (!customContext || typeof customContext !== "object") return null;
  const value = customContext.azureWorkItemId;
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : NaN;
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}
