/**
 * Quad — Drizzle schema (full ERD).
 * Tables align with spec.md section 7. Self-hosted single-instance model:
 * one `instance` singleton, `project` is the 1st-class boundary, `users` are
 * instance-global, role lives on `project_members`.
 *
 * IDs are UUID v4 generated app-side (crypto.randomUUID) to avoid pgcrypto
 * dependency. Timestamps are timestamptz.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// ---- Enums -----------------------------------------------------------------

export const projectMemberRole = pgEnum("project_member_role", [
  "owner",
  "admin",
  "member",
]);

export const projectMemberStatus = pgEnum("project_member_status", [
  "active",
  "pending",
]);

export const userStatus = pgEnum("user_status", [
  "pending",
  "active",
  "suspended",
]);

export const apiKeyScope = pgEnum("api_key_scope", ["sdk", "mcp"]);
export const apiKeyEnv = pgEnum("api_key_env", ["development", "production"]);

export const bugKind = pgEnum("bug_kind", ["pin", "session", "capture"]);
export const bugStatus = pgEnum("bug_status", [
  "new",
  "triaging",
  "confirmed",
  "resolved",
  "wont_do",
]);

export const commentLevel = pgEnum("comment_level", ["bug", "pin", "video"]);
export const commentAuthorKind = pgEnum("comment_author_kind", [
  "reporter",
  "member",
  "builder",
]);

export const attachmentKind = pgEnum("attachment_kind", [
  "video",
  "audio",
  "screenshot",
  "frame",
  "timeline",
  "brief",
]);

export const taskStatus = pgEnum("task_status", [
  "to_do",
  "in_progress",
  "reviewed",
  "resolved",
  "published",
  "done",
  "canceled",
]);

export const taskEventKind = pgEnum("task_event_kind", [
  "created",
  "picked",
  "dropped",
  "status_changed",
  "comment_added",
  "pr_attached",
  "brief_regenerated",
]);

export const auditWhoKind = pgEnum("audit_who_kind", [
  "user",
  "super_admin",
  "sdk_key",
  "mcp_key",
  "system",
]);

export const repoProvider = pgEnum("repo_provider", [
  "github",
  "gitlab",
  "local",
]);

export const transcriptProvider = pgEnum("transcript_provider", [
  "openai_whisper",
  "browser",
  "manual",
]);

// ---- Instance (singleton) --------------------------------------------------

export const instance = pgTable("instance", {
  id: integer("id").primaryKey().default(1), // singleton lock; always 1
  name: text("name").notNull().default("Quad"),
  // Encrypted at rest with SESSION_SECRET-derived key. Optional; if unset, STT
  // pipeline is disabled.
  openaiApiKeyEncrypted: text("openai_api_key_encrypted"),
  retentionOverrides: jsonb("retention_overrides")
    .$type<Partial<Record<"video" | "audio" | "screenshot", number>>>()
    .notNull()
    .default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ---- Users -----------------------------------------------------------------

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    name: text("name"),
    isSuperAdmin: boolean("is_super_admin").notNull().default(false),
    status: userStatus("status").notNull().default("pending"),
    approvedByUserId: uuid("approved_by_user_id"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    emailUq: uniqueIndex("users_email_uq").on(t.email),
  }),
);

// ---- Projects --------------------------------------------------------------

export type ProjectRepo = {
  provider: "github" | "gitlab" | "local";
  owner?: string;
  name?: string;
  defaultBranch?: string;
  pathPrefix?: string;
};

export type AzureDevOpsConfig = {
  enabled?: boolean;
  organization?: string;
  project?: string;
  reportState?: string;
  stateMap?: Partial<Record<
    "to_do" | "in_progress" | "reviewed" | "resolved" | "published" | "done" | "canceled",
    string
  >>;
};

export type ProjectIntegrationConfig = Record<string, unknown>;

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    allowedOrigins: text("allowed_origins").array().notNull().default(sql`'{}'`),
    repo: jsonb("repo").$type<ProjectRepo | null>(),
    azureDevOps: jsonb("azure_devops").$type<AzureDevOpsConfig | null>(),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    slugUq: uniqueIndex("projects_slug_uq").on(t.slug),
  }),
);

export const projectIntegrations = pgTable(
  "project_integrations",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    enabled: boolean("enabled").notNull().default(false),
    config: jsonb("config").$type<ProjectIntegrationConfig>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.projectId, t.provider] }),
    providerIdx: index("project_integrations_provider_idx").on(t.provider),
  }),
);

// ---- Project members -------------------------------------------------------

export const projectMembers = pgTable(
  "project_members",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: projectMemberRole("role").notNull().default("member"),
    status: projectMemberStatus("status").notNull().default("pending"),
    invitedByUserId: uuid("invited_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    joinedAt: timestamp("joined_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.projectId, t.userId] }),
    userIdx: index("project_members_user_idx").on(t.userId),
  }),
);

// ---- Invitations (email -> project) ----------------------------------------

export const invitations = pgTable(
  "invitations",
  {
    id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: projectMemberRole("role").notNull().default("member"),
    tokenHash: text("token_hash").notNull(),
    invitedByUserId: uuid("invited_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    projectEmailIdx: index("invitations_project_email_idx").on(
      t.projectId,
      t.email,
    ),
    tokenUq: uniqueIndex("invitations_token_uq").on(t.tokenHash),
  }),
);

// ---- API keys --------------------------------------------------------------

// `sdk` keys are scoped to a project (browser-exposed, origin-checked).
// `mcp` keys are scoped to a user (with explicit project_id list via
// `mcp_key_projects` join table).
export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    scope: apiKeyScope("scope").notNull(),
    env: apiKeyEnv("env").notNull().default("production"),
    keyHash: text("key_hash").notNull(),
    prefix: text("prefix").notNull(), // first ~8 chars, shown in UI
    label: text("label"),
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "cascade",
    }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    hashUq: uniqueIndex("api_keys_hash_uq").on(t.keyHash),
    prefixIdx: index("api_keys_prefix_idx").on(t.prefix),
    scopeProjectIdx: index("api_keys_scope_project_idx").on(t.scope, t.projectId),
    scopeUserIdx: index("api_keys_scope_user_idx").on(t.scope, t.userId),
  }),
);

export const mcpKeyProjects = pgTable(
  "mcp_key_projects",
  {
    apiKeyId: uuid("api_key_id")
      .notNull()
      .references(() => apiKeys.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.apiKeyId, t.projectId] }),
  }),
);

// ---- User integrations -------------------------------------------------------

export const userIntegrations = pgTable(
  "user_integrations",
  {
    id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    organization: text("organization").notNull(),
    secretEncrypted: text("secret_encrypted").notNull(),
    secretPrefix: text("secret_prefix"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    userProviderOrgUq: uniqueIndex("user_integrations_user_provider_org_uq").on(
      t.userId,
      t.provider,
      t.organization,
    ),
    userProviderIdx: index("user_integrations_user_provider_idx").on(
      t.userId,
      t.provider,
    ),
  }),
);

export const sdkReporterIntegrations = pgTable(
  "sdk_reporter_integrations",
  {
    id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    organization: text("organization").notNull(),
    reporterAnonKey: text("reporter_anon_key").notNull(),
    secretEncrypted: text("secret_encrypted").notNull(),
    secretPrefix: text("secret_prefix"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    reporterProviderOrgUq: uniqueIndex("sdk_reporter_integrations_reporter_provider_org_uq").on(
      t.projectId,
      t.provider,
      t.organization,
      t.reporterAnonKey,
    ),
    projectProviderIdx: index("sdk_reporter_integrations_project_provider_idx").on(
      t.projectId,
      t.provider,
    ),
  }),
);

// ---- Bug reports + occurrences --------------------------------------------

export type TargetBBox = { x: number; y: number; w: number; h: number };
export type TargetSourceLocation = {
  file: string;
  line?: number;
  column?: number;
  function?: string;
  excerpt?: string;
};
export type BugMeta = {
  userAgent?: string;
  viewport?: { w: number; h: number };
  devicePixelRatio?: number;
  timezone?: string;
  sdkVersion?: string;
  gitCommitSha?: string;
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

export const bugReports = pgTable(
  "bug_reports",
  {
    id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    fingerprint: text("fingerprint").notNull(),
    kind: bugKind("kind").notNull(),
    status: bugStatus("status").notNull().default("new"),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    targetSelector: text("target_selector"),
    targetDomPath: text("target_dom_path"),
    targetComponentPath: text("target_component_path"),
    targetSourceLocation: jsonb("target_source_location").$type<TargetSourceLocation | null>(),
    targetBbox: jsonb("target_bbox").$type<TargetBBox | null>(),
    targetRoute: text("target_route"),
    pageUrl: text("page_url"),
    meta: jsonb("meta").$type<BugMeta>().notNull().default(sql`'{}'::jsonb`),
    reporterUserId: uuid("reporter_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    reporterAnonKey: text("reporter_anon_key"),
    reporterIdentify: jsonb("reporter_identify")
      .$type<{ id?: string; email?: string; name?: string } | null>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    projectStatusIdx: index("bug_reports_project_status_idx").on(
      t.projectId,
      t.status,
    ),
    projectFingerprintIdx: index("bug_reports_project_fingerprint_idx").on(
      t.projectId,
      t.fingerprint,
    ),
    createdIdx: index("bug_reports_created_idx").on(t.createdAt),
  }),
);

export const bugOccurrences = pgTable(
  "bug_occurrences",
  {
    id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    bugReportId: uuid("bug_report_id")
      .notNull()
      .references(() => bugReports.id, { onDelete: "cascade" }),
    reporterUserId: uuid("reporter_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    reporterAnonKey: text("reporter_anon_key"),
    meta: jsonb("meta").$type<BugMeta>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    bugIdx: index("bug_occurrences_bug_idx").on(t.bugReportId),
  }),
);

// ---- Comments (3-level) ----------------------------------------------------

export const comments = pgTable(
  "comments",
  {
    id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    bugReportId: uuid("bug_report_id")
      .notNull()
      .references(() => bugReports.id, { onDelete: "cascade" }),
    level: commentLevel("level").notNull(),
    videoAttachmentId: uuid("video_attachment_id"),
    videoMs: integer("video_ms"),
    authorKind: commentAuthorKind("author_kind").notNull(),
    authorUserId: uuid("author_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    authorReporterAnonKey: text("author_reporter_anon_key"),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    bugIdx: index("comments_bug_idx").on(t.bugReportId),
    videoIdx: index("comments_video_idx").on(t.videoAttachmentId, t.videoMs),
  }),
);

// ---- Attachments + Transcripts --------------------------------------------

export const attachments = pgTable(
  "attachments",
  {
    id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    bugReportId: uuid("bug_report_id")
      .notNull()
      .references(() => bugReports.id, { onDelete: "cascade" }),
    kind: attachmentKind("kind").notNull(),
    storageKey: text("storage_key").notNull(),
    mime: text("mime").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    durationMs: integer("duration_ms"),
    width: integer("width"),
    height: integer("height"),
    tMs: integer("t_ms"), // for frames: timestamp inside parent video
    parentAttachmentId: uuid("parent_attachment_id"),
    sha256: text("sha256"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    bugIdx: index("attachments_bug_idx").on(t.bugReportId),
    storageUq: uniqueIndex("attachments_storage_uq").on(t.storageKey),
  }),
);

export type TranscriptSegment = {
  startMs: number;
  endMs: number;
  text: string;
};

export const transcripts = pgTable(
  "transcripts",
  {
    id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    attachmentId: uuid("attachment_id")
      .notNull()
      .references(() => attachments.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    language: text("language"),
    provider: transcriptProvider("provider").notNull(),
    segments: jsonb("segments")
      .$type<TranscriptSegment[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    attachmentUq: uniqueIndex("transcripts_attachment_uq").on(t.attachmentId),
  }),
);

// ---- Tasks -----------------------------------------------------------------

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    bugReportId: uuid("bug_report_id")
      .notNull()
      .references(() => bugReports.id, { onDelete: "cascade" }),
    status: taskStatus("status").notNull().default("to_do"),
    title: text("title").notNull(),
    maintainerInstruction: text("maintainer_instruction"),
    briefStorageKey: text("brief_storage_key").notNull(),
    bundleManifest: jsonb("bundle_manifest")
      .$type<{
        markdown: string;
        frames: Array<{ storageKey: string; tMs: number }>;
        timelineJson: string;
        transcriptJson?: string;
        sourceMd?: string;
      }>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    claimedByUserId: uuid("claimed_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    claimedByApiKeyId: uuid("claimed_by_api_key_id").references(() => apiKeys.id, {
      onDelete: "set null",
    }),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    prUrl: text("pr_url"),
    azureWorkItemId: integer("azure_work_item_id"),
    azureWorkItemUrl: text("azure_work_item_url"),
    confirmedByUserId: uuid("confirmed_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    projectStatusIdx: index("tasks_project_status_idx").on(
      t.projectId,
      t.status,
    ),
    azureWorkItemIdx: index("tasks_azure_work_item_idx").on(
      t.projectId,
      t.azureWorkItemId,
    ),
    bugUq: uniqueIndex("tasks_bug_uq").on(t.bugReportId),
  }),
);

export const taskExternalIssues = pgTable(
  "task_external_issues",
  {
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    externalId: text("external_id").notNull(),
    externalUrl: text("external_url"),
    title: text("title"),
    state: text("state"),
    syncStatus: text("sync_status").notNull().default("unknown"),
    syncError: text("sync_error"),
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.taskId, t.provider] }),
    providerExternalIdx: index("task_external_issues_provider_external_idx").on(
      t.provider,
      t.externalId,
    ),
  }),
);

export const taskEvents = pgTable(
  "task_events",
  {
    id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    kind: taskEventKind("kind").notNull(),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    actorApiKeyId: uuid("actor_api_key_id").references(() => apiKeys.id, {
      onDelete: "set null",
    }),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    taskIdx: index("task_events_task_idx").on(t.taskId, t.createdAt),
  }),
);

// ---- Audit log -------------------------------------------------------------

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    whoKind: auditWhoKind("who_kind").notNull(),
    whoId: text("who_id"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    action: text("action").notNull(),
    target: text("target"),
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    actionIdx: index("audit_log_action_idx").on(t.action, t.createdAt),
    whoIdx: index("audit_log_who_idx").on(t.whoKind, t.whoId),
  }),
);

// ---- Type exports ----------------------------------------------------------

export type Instance = typeof instance.$inferSelect;
export type User = typeof users.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type ProjectIntegration = typeof projectIntegrations.$inferSelect;
export type ProjectMember = typeof projectMembers.$inferSelect;
export type Invitation = typeof invitations.$inferSelect;
export type ApiKey = typeof apiKeys.$inferSelect;
export type UserIntegration = typeof userIntegrations.$inferSelect;
export type SdkReporterIntegration = typeof sdkReporterIntegrations.$inferSelect;
export type BugReport = typeof bugReports.$inferSelect;
export type BugOccurrence = typeof bugOccurrences.$inferSelect;
export type Comment = typeof comments.$inferSelect;
export type Attachment = typeof attachments.$inferSelect;
export type Transcript = typeof transcripts.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type TaskExternalIssue = typeof taskExternalIssues.$inferSelect;
export type TaskEvent = typeof taskEvents.$inferSelect;
export type AuditLog = typeof auditLog.$inferSelect;
