/**
 * Shared logic for ingest endpoints: upsert bug_report by fingerprint with
 * occurrence dedup, attach metadata, link attachments.
 */
import { and, eq } from "drizzle-orm";
import { db, schema } from "~/db";
import type { BugReport, BugMeta } from "~/db/schema";
import { env } from "~/lib/env";
import { computeFingerprint, normalizeRoute } from "~/lib/fingerprint";
import { presignDownload } from "~/lib/storage";
import {
  addAzureWorkItemComment,
  azureWorkItemUrl,
  formatAzureMention,
  isAzureDevOpsConfigured,
  setAzureWorkItemState,
} from "~/lib/azure-devops";
import { getAzureDevOpsConfig } from "~/server/integrations/store";
import { getSdkReporterAzureDevOpsSecret } from "~/server/sdk-reporter-integrations";

type ConsoleEntry = NonNullable<BugMeta["consoleLogs"]>[number];
type NetworkEntry = NonNullable<BugMeta["networkErrors"]>[number];
type AzureMention = {
  id: string;
  displayName?: string;
  uniqueName?: string;
};
type EvidenceSyncInput = {
  projectId: string;
  title: string;
  body: string;
  meta: IngestMeta;
  reporter?: IngestReporter;
  reporterAnonKey?: string;
  attachments?: CreateSessionInput["attachments"];
};

export type IngestMeta = {
  userAgent?: string;
  viewport?: { w: number; h: number };
  devicePixelRatio?: number;
  timezone?: string;
  sdkVersion?: string;
  commitSha?: string;
  consoleLogs?: Array<{ tMs: number; level: string; message: string }>;
  networkErrors?: Array<{
    tMs: number;
    method: string;
    url: string;
    status?: number;
    bodyPreview?: string;
  }>;
  customContext?: Record<string, unknown>;
};

export type IngestReporter = {
  id?: string;
  email?: string;
  name?: string;
} | undefined;

export type CreatePinInput = {
  projectId: string;
  pin: {
    selector: string;
    domPath: string;
    componentPath?: string;
    sourceLocation?: { file?: string; line?: number; column?: number; function?: string };
    bbox: { x: number; y: number; w: number; h: number };
    route: string;
    pageUrl: string;
    outerHtmlPreview: string;
    body: string;
    label?: string;
  };
  meta: IngestMeta;
  reporter?: IngestReporter;
  reporterAnonKey?: string;
};

export type CreateSessionInput = {
  projectId: string;
  title: string;
  body: string;
  meta: IngestMeta;
  reporter?: IngestReporter;
  reporterAnonKey?: string;
  attachments?: Array<{
    key: string;
    mime: string;
    sizeBytes: number;
    kind: "video" | "audio" | "screenshot";
  }>;
};

export type IngestResult = {
  id: string;
  fingerprint: string;
  occurrenceId?: string;
};

export async function createPin(input: CreatePinInput): Promise<IngestResult> {
  const route = normalizeRoute(input.pin.route);
  const firstConsole = pickFirst<{ message: string }>(input.meta.consoleLogs, (x) =>
    x.message.toLowerCase().includes("error") ? x.message : null,
  );
  const firstNetwork = (input.meta.networkErrors ?? []).find((n) => (n.status ?? 0) >= 400) ?? null;

  const fingerprint = computeFingerprint({
    projectId: input.projectId,
    route,
    selector: input.pin.selector,
    domPath: input.pin.domPath,
    firstConsoleError: firstConsole?.message ?? null,
    firstNetworkError: firstNetwork
      ? {
          method: firstNetwork.method,
          pathPattern: normalizeRoute(safeUrlPath(firstNetwork.url)),
          status: firstNetwork.status,
        }
      : null,
  });

  const existing = await findExisting(input.projectId, fingerprint);
  const reporterMeta = sanitizeMeta(input.meta);
  if (input.pin.label) {
    reporterMeta.customContext = {
      ...(reporterMeta.customContext ?? {}),
      quadLabel: input.pin.label,
    };
  }
  // Prefer the human label as the report title prefix — much more
  // scannable than a bare selector + body fragment.
  const titleBase = input.pin.label
    ? `${input.pin.label} — ${input.pin.body}`
    : input.pin.body;
  const computedTitle = titleBase.trim().slice(0, 80) || "(pin)";

  if (existing) {
    const [occ] = await db
      .insert(schema.bugOccurrences)
      .values({
        bugReportId: existing.id,
        reporterUserId: input.reporter?.id ? input.reporter.id : null,
        reporterAnonKey: input.reporterAnonKey ?? null,
        meta: reporterMeta,
      })
      .returning();
    await db
      .update(schema.bugReports)
      .set({ updatedAt: new Date() })
      .where(eq(schema.bugReports.id, existing.id));
    await syncAzureDevOpsFromReport(
      {
        projectId: input.projectId,
        title: computedTitle,
        body: input.pin.body,
        meta: input.meta,
        reporter: input.reporter,
        reporterAnonKey: input.reporterAnonKey,
        attachments: [],
      },
      existing,
    );
    return { id: existing.id, fingerprint, occurrenceId: occ?.id };
  }

  const [bug] = await db
    .insert(schema.bugReports)
    .values({
      projectId: input.projectId,
      fingerprint,
      kind: "pin",
      status: "new",
      title: computedTitle,
      body: input.pin.body,
      targetSelector: input.pin.selector,
      targetDomPath: input.pin.domPath,
      targetComponentPath: input.pin.componentPath ?? null,
      targetSourceLocation: input.pin.sourceLocation
        ? {
            file: input.pin.sourceLocation.file ?? "",
            line: input.pin.sourceLocation.line,
            column: input.pin.sourceLocation.column,
            function: input.pin.sourceLocation.function,
          }
        : null,
      targetBbox: input.pin.bbox,
      targetRoute: route,
      pageUrl: input.pin.pageUrl,
      meta: reporterMeta,
      reporterUserId: null,
      reporterAnonKey: input.reporterAnonKey ?? null,
      reporterIdentify: input.reporter
        ? {
            id: input.reporter.id,
            email: input.reporter.email,
            name: input.reporter.name,
          }
        : null,
    })
    .returning();
  if (!bug) throw new Error("bug_report insert failed");
  await syncAzureDevOpsFromReport(
    {
      projectId: input.projectId,
      title: computedTitle,
      body: input.pin.body,
      meta: input.meta,
      reporter: input.reporter,
      reporterAnonKey: input.reporterAnonKey,
      attachments: [],
    },
    bug,
  );
  return { id: bug.id, fingerprint };
}

export async function createSession(input: CreateSessionInput): Promise<IngestResult> {
  // Sessions are user-authored and don't auto-dedup; each submission is its
  // own bug_report (fingerprint still computed for downstream search).
  const route = normalizeRoute(safePathFromUrl(input.meta.customContext) ?? "/");
  const fingerprint = computeFingerprint({
    projectId: input.projectId,
    route,
    selector: input.title.slice(0, 80),
  });

  const reporterMeta = sanitizeMeta(input.meta);
  const [bug] = await db
    .insert(schema.bugReports)
    .values({
      projectId: input.projectId,
      fingerprint,
      kind: input.attachments?.some((a) => a.kind === "video") ? "capture" : "session",
      status: "new",
      title: input.title,
      body: input.body,
      meta: reporterMeta,
      reporterUserId: null,
      reporterAnonKey: input.reporterAnonKey ?? null,
      reporterIdentify: input.reporter
        ? {
            id: input.reporter.id,
            email: input.reporter.email,
            name: input.reporter.name,
          }
        : null,
    })
    .returning();
  if (!bug) throw new Error("bug_report insert failed");

  if (input.attachments && input.attachments.length > 0) {
    await db.insert(schema.attachments).values(
      input.attachments.map((a) => ({
        bugReportId: bug.id,
        kind: a.kind,
        storageKey: a.key,
        mime: a.mime,
        sizeBytes: a.sizeBytes,
      })),
    );
  }

  await syncAzureDevOpsFromReport(input, bug);

  return { id: bug.id, fingerprint };
}

// ---- helpers ---------------------------------------------------------------

async function findExisting(
  projectId: string,
  fingerprint: string,
): Promise<BugReport | null> {
  const rows = await db
    .select()
    .from(schema.bugReports)
    .where(
      and(
        eq(schema.bugReports.projectId, projectId),
        eq(schema.bugReports.fingerprint, fingerprint),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

function pickFirst<T>(arr: Array<T> | undefined, pick: (t: T) => string | null): { message: string } | null {
  if (!arr) return null;
  for (const x of arr) {
    const m = pick(x);
    if (m) return { message: m };
  }
  return null;
}

function safeUrlPath(u: string): string {
  try {
    return new URL(u, "http://_").pathname;
  } catch {
    return u;
  }
}

function safePathFromUrl(ctx: Record<string, unknown> | undefined): string | null {
  if (!ctx) return null;
  const u = ctx.pageUrl;
  if (typeof u !== "string") return null;
  try { return new URL(u).pathname; } catch { return null; }
}

async function syncAzureDevOpsFromReport(
  input: EvidenceSyncInput,
  bug: typeof schema.bugReports.$inferSelect,
): Promise<void> {
  const workItemIds = readAzureWorkItemIds(input.meta.customContext);
  if (workItemIds.length === 0) return;

  const attemptedAt = new Date().toISOString();
  try {
    const projectRows = await db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, input.projectId))
      .limit(1);
    const project = projectRows[0];
    if (!project) {
      await markBugAzureDevOpsSync(bug, {
        attemptedAt,
        workItemId: workItemIds[0],
        workItemIds,
        synced: false,
        error: "Project not found",
      });
      return;
    }
    const config = await getAzureDevOpsConfig(project);
    const sdkPat = await getSdkReporterAzureDevOpsSecret({
      projectId: project.id,
      organization: config?.organization,
      reporterAnonKey: input.reporterAnonKey,
    });

    if (!sdkPat) {
      await markBugAzureDevOpsSync(bug, {
        attemptedAt,
        workItemIds,
        synced: false,
        error: "SDK reporter Azure DevOps PAT is missing",
      });
      return;
    }

    if (!isAzureDevOpsConfigured(config, sdkPat)) {
      await markBugAzureDevOpsSync(bug, {
        attemptedAt,
        workItemIds,
        synced: false,
        error: "Azure DevOps sync is disabled or incomplete",
      });
      return;
    }

    const state = config?.reportState?.trim() || "Reopened";
    const results: Array<{ workItemId: number; state: string | null; url: string | undefined }> = [];
    for (const workItemId of workItemIds) {
      const syncedState = await setAzureWorkItemState(config, workItemId, state, sdkPat);
      await addAzureWorkItemComment(
        config,
        workItemId,
        await renderAzureReportComment(input, bug, project, workItemIds),
        sdkPat,
      );
      results.push({
        workItemId,
        state: syncedState,
        url: config ? azureWorkItemUrl(config, workItemId) : undefined,
      });
    }

    await markBugAzureDevOpsSync(bug, {
      attemptedAt,
      workItemId: workItemIds[0],
      workItemIds,
      synced: true,
      state,
      results,
      commentSynced: true,
      url: results[0]?.url,
    });
  } catch (err) {
    await markBugAzureDevOpsSync(bug, {
      attemptedAt,
      workItemId: workItemIds[0],
      workItemIds,
      synced: false,
      error: err instanceof Error ? err.message : "Azure DevOps report sync failed",
    });
  }
}

async function markBugAzureDevOpsSync(
  bug: typeof schema.bugReports.$inferSelect,
  sync: Record<string, unknown>,
): Promise<void> {
  await db
    .update(schema.bugReports)
    .set({
      meta: {
        ...bug.meta,
        customContext: {
          ...bug.meta.customContext,
          azureDevOps: sync,
        },
      },
      updatedAt: new Date(),
    })
    .where(eq(schema.bugReports.id, bug.id));
}

async function renderAzureReportComment(
  input: EvidenceSyncInput,
  bug: typeof schema.bugReports.$inferSelect,
  project: typeof schema.projects.$inferSelect,
  syncedWorkItemIds: number[],
): Promise<string> {
  const pageUrl = readString(input.meta.customContext?.pageUrl);
  const relatedWorkItemIds = readRelatedWorkItemIds(input.meta.customContext);
  const mentions = readAzureMentions(input.meta.customContext);
  const reporter = input.reporter?.name ?? input.reporter?.email ?? input.reporter?.id ?? input.reporterAnonKey ?? "anonymous";
  const attachments = input.attachments?.length ?? 0;
  const evidenceUrl = `${env().API_URL.replace(/\/$/, "")}/projects/${project.slug}/bug/${bug.id}`;
  const attachmentLines = await renderAttachmentLinks(input.attachments ?? []);
  const body = input.body.trim() || "(no description)";
  const mentionLine = mentions.map((mention) => formatAzureMention(mention.id)).join(" ");
  return [
    mentionLine,
    `Quad evidence submitted`,
    ``,
    `**Title:** ${bug.title}`,
    `**Reporter:** ${reporter}`,
    pageUrl ? `**Page:** ${pageUrl}` : "",
    `**Quad evidence:** [Open report in Quad](${evidenceUrl})`,
    `**Attachments:** ${attachments}`,
    attachmentLines.length ? attachmentLines.join("\n") : "",
    attachments ? `_Direct download links expire in 7 days. The Quad report link remains the stable evidence record._` : "",
    syncedWorkItemIds.length ? `**Synced Work Items:** ${syncedWorkItemIds.map((id) => `#${id}`).join(", ")}` : "",
    relatedWorkItemIds.length ? `**Related Work Items:** ${relatedWorkItemIds.map((id) => `#${id}`).join(", ")}` : "",
    ``,
    `**Description**`,
    body.slice(0, 2000),
  ].filter(Boolean).join("\n");
}

async function renderAttachmentLinks(
  attachments: NonNullable<CreateSessionInput["attachments"]>,
): Promise<string[]> {
  const rows = attachments.slice(0, 12);
  return Promise.all(
    rows.map(async (attachment, index) => {
      const url = await presignDownload(attachment.key, 60 * 60 * 24 * 7);
      const label = `${attachment.kind} ${index + 1}`;
      const size = formatBytes(attachment.sizeBytes);
      return `- ${label} · ${attachment.mime} · ${size} · [download](${url})`;
    }),
  );
}

function readAzureWorkItemIds(customContext: Record<string, unknown> | undefined): number[] {
  if (!customContext || typeof customContext !== "object") return [];
  const raw = [
    customContext.azureWorkItemId,
    customContext.azureWorkItemIds,
    customContext.userStoryWorkItemId,
    customContext.taskWorkItemId,
  ].flatMap((value) => Array.isArray(value) ? value : value == null ? [] : [value]);
  return Array.from(
    new Set(
      raw
        .map((item) => (typeof item === "number" ? item : Number.parseInt(String(item).replace(/^#/, ""), 10)))
        .filter((n) => Number.isFinite(n) && n > 0)
        .map((n) => Math.trunc(n)),
    ),
  ).slice(0, 8);
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? value.toFixed(0) : value.toFixed(1)}${units[unit]}`;
}

function readRelatedWorkItemIds(customContext: Record<string, unknown> | undefined): number[] {
  const value = customContext?.relatedWorkItemIds;
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[,\s]+/) : [];
  return Array.from(
    new Set(
      raw
        .map((item) => (typeof item === "number" ? item : Number.parseInt(String(item).replace(/^#/, ""), 10)))
        .filter((n) => Number.isFinite(n) && n > 0)
        .map((n) => Math.trunc(n)),
    ),
  ).slice(0, 12);
}

function readAzureMentions(customContext: Record<string, unknown> | undefined): AzureMention[] {
  const value = customContext?.azureMentions;
  if (!Array.isArray(value)) return [];
  const mentions: AzureMention[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const id = (item as { id?: unknown }).id;
    if (typeof id !== "string" || !id.trim()) continue;
    mentions.push({
      id: id.trim(),
      displayName: readString((item as { displayName?: unknown }).displayName) ?? undefined,
      uniqueName: readString((item as { uniqueName?: unknown }).uniqueName) ?? undefined,
    });
  }
  return mentions.slice(0, 10);
}

function sanitizeMeta(m: IngestMeta) {
  // Truncate ring buffers + strip headers we promised not to keep.
  const consoleLogs = (m.consoleLogs ?? []).slice(0, 50).map((c) => ({
    tMs: c.tMs,
    level: c.level,
    message: c.message.slice(0, 4_000),
  })) as ConsoleEntry[];
  const networkErrors = (m.networkErrors ?? []).slice(0, 20).map((n) => ({
    tMs: n.tMs,
    method: n.method,
    url: stripCredentialsFromUrl(n.url),
    status: n.status,
    bodyPreview: n.bodyPreview?.slice(0, 500),
  })) as NetworkEntry[];
  return {
    userAgent: m.userAgent,
    viewport: m.viewport,
    devicePixelRatio: m.devicePixelRatio,
    timezone: m.timezone,
    sdkVersion: m.sdkVersion,
    gitCommitSha: m.commitSha,
    consoleLogs,
    networkErrors,
    customContext: m.customContext,
  };
}

function stripCredentialsFromUrl(u: string): string {
  try {
    const url = new URL(u, "http://_");
    url.username = "";
    url.password = "";
    return url.toString();
  } catch {
    return u;
  }
}
