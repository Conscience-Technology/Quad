import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "~/db";
import {
  addAzureWorkItemComment,
  getAzureDevOpsPatForUser,
  updateAzureWorkItemState,
} from "~/lib/azure-devops";
import { authMcpRequest, projectAllowed } from "~/lib/mcp-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  status: z.enum(["queued", "picked", "in_progress", "pr_open", "done", "wont_do"]),
  prUrl: z.string().url().optional(),
  note: z.string().max(2_000).optional(),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const r = await authMcpRequest(req);
  if (!r.ok) return NextResponse.json({ error: r.err.error }, { status: r.err.status });
  const { id } = await ctx.params;
  const body = Body.parse(await req.json());

  const [task] = await db.select().from(schema.tasks).where(eq(schema.tasks.id, id)).limit(1);
  if (!task) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!projectAllowed(r.auth, task.projectId)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const patch: Record<string, unknown> = { status: body.status, updatedAt: new Date() };
  if (body.prUrl) patch.prUrl = body.prUrl;
  await db.update(schema.tasks).set(patch).where(eq(schema.tasks.id, task.id));

  const [project] = await db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, task.projectId))
    .limit(1);
  let azureDevOps: Record<string, unknown> | undefined;
  let externalIssue: Record<string, unknown> | undefined;
  try {
    const azurePat = await getAzureDevOpsPatForUser(
      r.auth.user.id,
      project?.azureDevOps?.organization,
    );
    const mappedState = await updateAzureWorkItemState(
      project?.azureDevOps,
      task.azureWorkItemId,
      body.status,
      azurePat,
    );
    if (mappedState) {
      const lines = [
        `Quad task status changed to \`${body.status}\` → Azure DevOps state \`${mappedState}\`.`,
        body.prUrl ? `PR: ${body.prUrl}` : "",
        body.note ? `Note: ${body.note}` : "",
      ].filter(Boolean);
      await addAzureWorkItemComment(
        project?.azureDevOps,
        task.azureWorkItemId,
        lines.join("\n\n"),
        azurePat,
      );
      azureDevOps = { workItemId: task.azureWorkItemId, state: mappedState, synced: true };
      externalIssue = {
        provider: "azure-devops",
        id: task.azureWorkItemId,
        state: mappedState,
        synced: true,
      };
    }
  } catch (err) {
    azureDevOps = {
      workItemId: task.azureWorkItemId,
      synced: false,
      error: err instanceof Error ? err.message : String(err),
    };
    externalIssue = {
      provider: "azure-devops",
      id: task.azureWorkItemId,
      synced: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
  await db.insert(schema.taskEvents).values({
    taskId: task.id,
    kind: body.status === "pr_open" ? "pr_attached" : "status_changed",
    actorUserId: r.auth.user.id,
    actorApiKeyId: r.auth.apiKey.id,
    payload: { status: body.status, prUrl: body.prUrl, note: body.note, azureDevOps, externalIssue },
  });
  if (body.status === "done") {
    await db
      .update(schema.bugReports)
      .set({ status: "resolved", updatedAt: new Date() })
      .where(eq(schema.bugReports.id, task.bugReportId));
  }
  return NextResponse.json({ ok: true, externalIssue });
}
