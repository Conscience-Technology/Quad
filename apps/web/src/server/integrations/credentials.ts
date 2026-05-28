import { and, eq } from "drizzle-orm";
import { db, schema } from "~/db";
import { decryptSecret } from "~/lib/secret-box";
import type { IssueProviderId } from "./types";

export async function getUserIntegrationSecret(
  provider: IssueProviderId,
  userId: string | null | undefined,
  organization: string | null | undefined,
): Promise<string | null> {
  if (!userId || !organization) return null;
  const rows = await db
    .select({ secretEncrypted: schema.userIntegrations.secretEncrypted })
    .from(schema.userIntegrations)
    .where(
      and(
        eq(schema.userIntegrations.userId, userId),
        eq(schema.userIntegrations.provider, provider),
        eq(schema.userIntegrations.organization, organization),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return decryptSecret(row.secretEncrypted);
}
