import { and, eq } from "drizzle-orm";
import { db, schema } from "~/db";
import { decryptSecret, encryptSecret } from "~/lib/secret-box";
import { AZURE_DEVOPS_PROVIDER_ID } from "./integrations/azure-devops";

export async function getSdkReporterAzureDevOpsSecret(input: {
  projectId: string;
  organization: string | null | undefined;
  reporterAnonKey: string | null | undefined;
}): Promise<string | null> {
  const organization = input.organization?.trim();
  const reporterAnonKey = input.reporterAnonKey?.trim();
  if (!organization || !reporterAnonKey) return null;
  const [row] = await db
    .select({ secretEncrypted: schema.sdkReporterIntegrations.secretEncrypted })
    .from(schema.sdkReporterIntegrations)
    .where(
      and(
        eq(schema.sdkReporterIntegrations.projectId, input.projectId),
        eq(schema.sdkReporterIntegrations.provider, AZURE_DEVOPS_PROVIDER_ID),
        eq(schema.sdkReporterIntegrations.organization, organization),
        eq(schema.sdkReporterIntegrations.reporterAnonKey, reporterAnonKey),
      ),
    )
    .limit(1);
  return row ? decryptSecret(row.secretEncrypted) : null;
}

export async function getSdkReporterAzureDevOpsStatus(input: {
  projectId: string;
  organization: string | null | undefined;
  reporterAnonKey: string | null | undefined;
}): Promise<{ configured: boolean; prefix?: string | null }> {
  const organization = input.organization?.trim();
  const reporterAnonKey = input.reporterAnonKey?.trim();
  if (!organization || !reporterAnonKey) return { configured: false };
  const [row] = await db
    .select({ secretPrefix: schema.sdkReporterIntegrations.secretPrefix })
    .from(schema.sdkReporterIntegrations)
    .where(
      and(
        eq(schema.sdkReporterIntegrations.projectId, input.projectId),
        eq(schema.sdkReporterIntegrations.provider, AZURE_DEVOPS_PROVIDER_ID),
        eq(schema.sdkReporterIntegrations.organization, organization),
        eq(schema.sdkReporterIntegrations.reporterAnonKey, reporterAnonKey),
      ),
    )
    .limit(1);
  return { configured: Boolean(row), prefix: row?.secretPrefix };
}

export async function upsertSdkReporterAzureDevOpsSecret(input: {
  projectId: string;
  organization: string;
  reporterAnonKey: string;
  pat: string;
}) {
  const now = new Date();
  const pat = input.pat.trim();
  const prefix = pat.length >= 4 ? `•••• ${pat.slice(-4)}` : "저장됨";
  const [row] = await db
    .insert(schema.sdkReporterIntegrations)
    .values({
      projectId: input.projectId,
      provider: AZURE_DEVOPS_PROVIDER_ID,
      organization: input.organization.trim(),
      reporterAnonKey: input.reporterAnonKey.trim(),
      secretEncrypted: encryptSecret(pat),
      secretPrefix: prefix,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        schema.sdkReporterIntegrations.projectId,
        schema.sdkReporterIntegrations.provider,
        schema.sdkReporterIntegrations.organization,
        schema.sdkReporterIntegrations.reporterAnonKey,
      ],
      set: {
        secretEncrypted: encryptSecret(pat),
        secretPrefix: prefix,
        updatedAt: now,
      },
    })
    .returning();
  return row;
}

export async function deleteSdkReporterAzureDevOpsSecret(input: {
  projectId: string;
  organization: string | null | undefined;
  reporterAnonKey: string | null | undefined;
}) {
  const organization = input.organization?.trim();
  const reporterAnonKey = input.reporterAnonKey?.trim();
  if (!organization || !reporterAnonKey) return;
  await db
    .delete(schema.sdkReporterIntegrations)
    .where(
      and(
        eq(schema.sdkReporterIntegrations.projectId, input.projectId),
        eq(schema.sdkReporterIntegrations.provider, AZURE_DEVOPS_PROVIDER_ID),
        eq(schema.sdkReporterIntegrations.organization, organization),
        eq(schema.sdkReporterIntegrations.reporterAnonKey, reporterAnonKey),
      ),
    );
}
