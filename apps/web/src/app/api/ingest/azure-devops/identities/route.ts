import { NextResponse } from "next/server";
import { z } from "zod";
import { authSdkRequest, withCors } from "~/lib/sdk-auth";
import { searchAzureIdentities } from "~/lib/azure-devops";
import { getAzureDevOpsConfig } from "~/server/integrations/store";
import { getSdkReporterAzureDevOpsSecret } from "~/server/sdk-reporter-integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Query = z.object({
  q: z.string().trim().min(2).max(80),
  reporter_anon: z.string().min(1),
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
  const parsed = Query.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) {
    return withCors(req, project.allowedOrigins, NextResponse.json({ error: "invalid query" }, { status: 400 }));
  }
  const config = await getAzureDevOpsConfig(project);
  const pat = await getSdkReporterAzureDevOpsSecret({
    projectId: project.id,
    organization: config?.organization,
    reporterAnonKey: parsed.data.reporter_anon,
  });
  if (!pat) {
    return withCors(
      req,
      project.allowedOrigins,
      NextResponse.json({ error: "Azure DevOps PAT is not saved for this SDK reporter" }, { status: 412 }),
    );
  }
  try {
    const identities = await searchAzureIdentities(config, parsed.data.q, pat);
    return withCors(req, project.allowedOrigins, NextResponse.json({ identities }));
  } catch (err) {
    return withCors(
      req,
      project.allowedOrigins,
      NextResponse.json({ error: err instanceof Error ? err.message : "Azure identity search failed" }, { status: 500 }),
    );
  }
}
