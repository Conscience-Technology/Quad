/**
 * Shared logic for ingest endpoints: upsert bug_report by fingerprint with
 * occurrence dedup, attach metadata, link attachments.
 */
import { and, eq } from "drizzle-orm";
import { db, schema } from "~/db";
import type { BugReport, BugMeta } from "~/db/schema";
import { computeFingerprint, normalizeRoute } from "~/lib/fingerprint";
import {
  addAzureWorkItemComment,
  azureWorkItemUrl,
  isAzureDevOpsConfigured,
  setAzureWorkItemState,
} from "~/lib/azure-devops";
import { getAzureDevOpsConfig } from "~/server/integrations/store";

type ConsoleEntry = NonNullable<BugMeta["consoleLogs"]>[number];
type NetworkEntry = NonNullable<BugMeta["networkErrors"]>[number];

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
  input: CreateSessionInput,
  bug: typeof schema.bugReports.$inferSelect,
): Promise<void> {
  const workItemId = readAzureWorkItemId(bug.meta);
  if (!workItemId) return;

  const attemptedAt = new Date().toISOString();
  try {
    const projectRows = await db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, input.projectId))
      .limit(1);
    const project = projectRows[0];
    const config = project ? await getAzureDevOpsConfig(project) : null;

    if (!isAzureDevOpsConfigured(config)) {
      await markBugAzureDevOpsSync(bug, {
        attemptedAt,
        workItemId,
        synced: false,
        error: "Azure DevOps sync is disabled, incomplete, or AZURE_DEVOPS_PAT is missing",
      });
      return;
    }

    const state = config?.reportState?.trim() || "Reopened";
    const syncedState = await setAzureWorkItemState(config, workItemId, state);
    await addAzureWorkItemComment(
      config,
      workItemId,
      renderAzureReportComment(input, bug),
    );

    await markBugAzureDevOpsSync(bug, {
      attemptedAt,
      workItemId,
      synced: true,
      state: syncedState,
      commentSynced: true,
      url: config ? azureWorkItemUrl(config, workItemId) : undefined,
    });
  } catch (err) {
    await markBugAzureDevOpsSync(bug, {
      attemptedAt,
      workItemId,
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

function renderAzureReportComment(
  input: CreateSessionInput,
  bug: typeof schema.bugReports.$inferSelect,
): string {
  const pageUrl = readString(input.meta.customContext?.pageUrl);
  const reporter = input.reporter?.email ?? input.reporter?.name ?? input.reporter?.id ?? input.reporterAnonKey ?? "anonymous";
  const attachments = input.attachments?.length ?? 0;
  const body = input.body.trim() || "(no description)";
  return [
    `Quad bug report submitted`,
    ``,
    `**Title:** ${bug.title}`,
    `**Reporter:** ${reporter}`,
    pageUrl ? `**Page:** ${pageUrl}` : "",
    `**Attachments:** ${attachments}`,
    ``,
    `**Description**`,
    body.slice(0, 2000),
  ].filter(Boolean).join("\n");
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

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
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
