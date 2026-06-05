import { NextResponse } from "next/server";
import { z } from "zod";
import { authSdkRequest, withCors } from "~/lib/sdk-auth";
import { azureDevOpsProvider } from "~/server/integrations/azure-devops";
import { getAzureDevOpsConfig } from "~/server/integrations/store";
import {
  deleteSdkReporterAzureDevOpsSecret,
  getSdkReporterAzureDevOpsStatus,
  upsertSdkReporterAzureDevOpsSecret,
} from "~/server/sdk-reporter-integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ReporterQuery = z.object({
  reporter_anon: z.string().min(1),
});

const SaveBody = z.object({
  reporterAnonKey: z.string().min(1),
  pat: z.string().min(20).max(512),
});

const DeleteBody = z.object({
  reporterAnonKey: z.string().min(1),
});

export async function OPTIONS(req: Request) {
  return withCors(req, [], new NextResponse(null, { status: 204 }));
}

export async function GET(req: Request) {
  const authResult = await authSdkRequest(req);
  if (!authResult.ok) {
    return withCors(req, [], NextResponse.json({ error: authResult.err.error }, { status: authResult.err.status }));
  }
  const { project } = authResult.auth;
  const config = await getAzureDevOpsConfig(project);
  const parsed = ReporterQuery.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) {
    return withCors(req, project.allowedOrigins, NextResponse.json({ error: "invalid query" }, { status: 400 }));
  }
  const status = await getSdkReporterAzureDevOpsStatus({
    projectId: project.id,
    organization: config?.organization,
    reporterAnonKey: parsed.data.reporter_anon,
  });
  return withCors(req, project.allowedOrigins, NextResponse.json(status));
}

export async function POST(req: Request) {
  const authResult = await authSdkRequest(req);
  if (!authResult.ok) {
    return withCors(req, [], NextResponse.json({ error: authResult.err.error }, { status: authResult.err.status }));
  }
  const { project } = authResult.auth;
  const config = await getAzureDevOpsConfig(project);
  if (!config?.enabled || !config.organization?.trim() || !config.project?.trim()) {
    return withCors(
      req,
      project.allowedOrigins,
      NextResponse.json({ error: "Azure DevOps project config is missing" }, { status: 412 }),
    );
  }
  const body = SaveBody.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return withCors(req, project.allowedOrigins, NextResponse.json({ error: "invalid body" }, { status: 400 }));
  }
  try {
    if (!azureDevOpsProvider.testConnection) {
      throw new Error("Azure DevOps PAT validation is unavailable");
    }
    await azureDevOpsProvider.testConnection({ config, credentials: body.data.pat });
    const row = await upsertSdkReporterAzureDevOpsSecret({
      projectId: project.id,
      organization: config.organization,
      reporterAnonKey: body.data.reporterAnonKey,
      pat: body.data.pat,
    });
    return withCors(
      req,
      project.allowedOrigins,
      NextResponse.json({ configured: true, prefix: row?.secretPrefix ?? null }),
    );
  } catch (err) {
    return withCors(
      req,
      project.allowedOrigins,
      NextResponse.json(
        { error: err instanceof Error ? err.message : "Azure DevOps PAT validation failed" },
        { status: 400 },
      ),
    );
  }
}

export async function DELETE(req: Request) {
  const authResult = await authSdkRequest(req);
  if (!authResult.ok) {
    return withCors(req, [], NextResponse.json({ error: authResult.err.error }, { status: authResult.err.status }));
  }
  const { project } = authResult.auth;
  const config = await getAzureDevOpsConfig(project);
  const body = DeleteBody.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return withCors(req, project.allowedOrigins, NextResponse.json({ error: "invalid body" }, { status: 400 }));
  }
  await deleteSdkReporterAzureDevOpsSecret({
    projectId: project.id,
    organization: config?.organization,
    reporterAnonKey: body.data.reporterAnonKey,
  });
  return withCors(req, project.allowedOrigins, NextResponse.json({ configured: false }));
}
