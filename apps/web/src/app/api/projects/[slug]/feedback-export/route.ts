import ExcelJS from "exceljs";
import { and, asc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db, schema } from "~/db";
import { getCurrentUser } from "~/lib/auth/current-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  new: "New",
  triaging: "Triaging",
  confirmed: "Confirmed",
  resolved: "Resolved",
  wont_do: "Won't do",
};

const TYPE_LABEL: Record<string, string> = {
  pin: "UI 위치 제보",
  session: "일반 제보",
  capture: "녹화 제보",
};

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { slug } = await ctx.params;
  const projectRows = await db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.slug, slug))
    .limit(1);
  const project = projectRows[0];
  if (!project) return NextResponse.json({ error: "project not found" }, { status: 404 });

  if (!user.isSuperAdmin) {
    const membership = await db
      .select({ status: schema.projectMembers.status })
      .from(schema.projectMembers)
      .where(
        and(
          eq(schema.projectMembers.projectId, project.id),
          eq(schema.projectMembers.userId, user.id),
        ),
      )
      .limit(1);
    if (membership[0]?.status !== "active") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  const reports = await db
    .select()
    .from(schema.bugReports)
    .where(eq(schema.bugReports.projectId, project.id))
    .orderBy(asc(schema.bugReports.createdAt));

  const reportIds = reports.map((r) => r.id);
  const [comments, attachments, occurrenceRows] = reportIds.length
    ? await Promise.all([
        db
          .select()
          .from(schema.comments)
          .where(inArray(schema.comments.bugReportId, reportIds))
          .orderBy(asc(schema.comments.createdAt)),
        db
          .select()
          .from(schema.attachments)
          .where(inArray(schema.attachments.bugReportId, reportIds))
          .orderBy(asc(schema.attachments.createdAt)),
        db
          .select()
          .from(schema.bugOccurrences)
          .where(inArray(schema.bugOccurrences.bugReportId, reportIds)),
      ])
    : [[], [], []];

  const commentsByReport = groupBy(comments, (c) => c.bugReportId);
  const attachmentsByReport = groupBy(attachments, (a) => a.bugReportId);
  const occurrenceCount = countBy(occurrenceRows, (o) => o.bugReportId);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Quad";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Sheet1", {
    views: [{ state: "frozen", ySplit: 2 }],
    properties: { defaultRowHeight: 24 },
  });

  sheet.columns = [
    { key: "no", width: 7 },
    { key: "type", width: 16 },
    { key: "feature", width: 18 },
    { key: "userStory", width: 18 },
    { key: "current", width: 48 },
    { key: "intent", width: 48 },
    { key: "date", width: 14 },
    { key: "reporter", width: 18 },
    { key: "comment", width: 52 },
  ];

  sheet.getRow(1).values = [
    "No.",
    "Type",
    "DevOps Info.",
    "",
    "현재 사양",
    "의도 사양",
    "보고 일자",
    "보고자",
    "코멘트",
  ];
  sheet.getRow(2).values = ["", "", "Feature", "User Story", "", "", "", "", ""];
  sheet.mergeCells("C1:D1");

  for (const rowNo of [1, 2]) {
    const row = sheet.getRow(rowNo);
    row.height = rowNo === 1 ? 26 : 22;
    row.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FF111827" } };
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };
      cell.border = border();
    });
  }

  reports.forEach((report, index) => {
    const reportComments = commentsByReport.get(report.id) ?? [];
    const reportAttachments = attachmentsByReport.get(report.id) ?? [];
    const row = sheet.addRow({
      no: index + 1,
      type: report.feedbackType ?? TYPE_LABEL[report.kind] ?? report.kind,
      feature: report.feedbackFeature ?? "",
      userStory: report.feedbackUserStory ?? "",
      current: report.feedbackCurrentSpec ?? formatCurrent(report),
      intent: report.feedbackIntendedSpec ?? "",
      date: formatDate(report.feedbackReportedAt ?? report.createdAt),
      reporter: report.feedbackReporter ?? formatReporter(report.reporterIdentify, report.reporterAnonKey),
      comment: formatComment(report, reportComments, reportAttachments, occurrenceCount.get(report.id) ?? 0),
    });
    row.height = estimateRowHeight(row.getCell(5).value, row.getCell(9).value);
    row.eachCell((cell) => {
      cell.alignment = { vertical: "top", wrapText: true };
      cell.border = border();
    });
    row.getCell(1).alignment = { vertical: "top", horizontal: "center" };
    row.getCell(7).alignment = { vertical: "top", horizontal: "center" };
  });

  sheet.autoFilter = "A2:I2";
  sheet.eachRow((row) => {
    row.eachCell((cell) => {
      cell.protection = { locked: false };
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const fileName = `${safeFilename(project.slug)}_quad_feedback_${compactDate(new Date())}.xlsx`;
  return new Response(buffer, {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": contentDisposition(fileName),
      "cache-control": "no-store",
    },
  });
}

function groupBy<T>(rows: T[], getKey: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const key = getKey(row);
    const next = map.get(key) ?? [];
    next.push(row);
    map.set(key, next);
  }
  return map;
}

function countBy<T>(rows: T[], getKey: (row: T) => string): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) {
    const key = getKey(row);
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
}

function border(): Partial<ExcelJS.Borders> {
  return {
    top: { style: "thin", color: { argb: "FFD1D5DB" } },
    left: { style: "thin", color: { argb: "FFD1D5DB" } },
    bottom: { style: "thin", color: { argb: "FFD1D5DB" } },
    right: { style: "thin", color: { argb: "FFD1D5DB" } },
  };
}

function shortId(id: string): string {
  return id.slice(0, 8);
}

function formatLocation(report: typeof schema.bugReports.$inferSelect): string {
  const parts = [
    report.targetRoute ? `Route: ${report.targetRoute}` : null,
    report.targetSelector ? `Selector: ${report.targetSelector}` : null,
    report.targetComponentPath ? `Component: ${report.targetComponentPath}` : null,
    report.pageUrl ? `URL: ${report.pageUrl}` : null,
  ].filter(Boolean);
  return parts.join("\n");
}

function formatCurrent(report: typeof schema.bugReports.$inferSelect): string {
  return [report.title, report.body && report.body !== report.title ? report.body : null]
    .filter(Boolean)
    .join("\n\n");
}

function formatReporter(
  reporterIdentify: { id?: string; email?: string; name?: string } | null,
  reporterAnonKey: string | null,
): string {
  return reporterIdentify?.name || reporterIdentify?.email || reporterIdentify?.id || reporterAnonKey || "";
}

function formatComment(
  report: typeof schema.bugReports.$inferSelect,
  comments: Array<typeof schema.comments.$inferSelect>,
  attachments: Array<typeof schema.attachments.$inferSelect>,
  occurrences: number,
): string {
  const lines = [
    `QUAD Report: ${shortId(report.id)}`,
    (report.feedbackLocation ?? formatLocation(report)) ? `위치:\n${report.feedbackLocation ?? formatLocation(report)}` : null,
    `상태: ${STATUS_LABEL[report.status] ?? report.status}`,
    report.feedbackComment ? report.feedbackComment : null,
    occurrences > 0 ? `재현/발생 횟수: ${occurrences + 1}` : null,
    attachments.length > 0
      ? `첨부: ${attachments.map((a) => `${a.kind}(${a.mime})`).join(", ")}`
      : null,
    comments.length > 0 ? "댓글:" : null,
    ...comments.map((c) => `- ${formatDate(c.createdAt)} ${c.body}`),
  ].filter(Boolean);
  return lines.join("\n");
}

function formatDate(input: Date | string): string {
  const date = input instanceof Date ? input : new Date(input);
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const y = parts.find((p) => p.type === "year")?.value ?? "";
  const m = parts.find((p) => p.type === "month")?.value ?? "";
  const d = parts.find((p) => p.type === "day")?.value ?? "";
  return `${y}.${m}.${d}`;
}

function compactDate(date: Date): string {
  return formatDate(date).replace(/\./g, "");
}

function safeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80) || "quad";
}

function contentDisposition(fileName: string): string {
  return `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

function estimateRowHeight(...values: unknown[]): number {
  const maxLen = values
    .map((v) => String(v ?? "").length)
    .reduce((a, b) => Math.max(a, b), 0);
  return Math.max(28, Math.min(132, 22 + Math.ceil(maxLen / 58) * 16));
}
