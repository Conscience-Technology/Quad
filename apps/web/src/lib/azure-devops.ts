import type { AzureDevOpsConfig } from "~/db/schema";
import { eq, and } from "drizzle-orm";
import { db, schema } from "~/db";
import { decryptSecret } from "./secret-box";
import { env } from "./env";

type TaskStatus = "queued" | "picked" | "in_progress" | "pr_open" | "done" | "wont_do";

export type AzureWorkItem = {
  id: number;
  url: string;
  title?: string;
  state?: string;
};

const DEFAULT_STATE_MAP: Record<TaskStatus, string> = {
  queued: "New",
  picked: "New",
  in_progress: "In Progress",
  pr_open: "In Progress",
  done: "Closed",
  wont_do: "Removed",
};

export function isAzureDevOpsConfigured(
  config: AzureDevOpsConfig | null | undefined,
  pat?: string | null,
): boolean {
  return !!(
    config?.enabled &&
    config.organization?.trim() &&
    config.project?.trim() &&
    (pat || env().AZURE_DEVOPS_PAT)
  );
}

export async function getAzureDevOpsPatForUser(
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
        eq(schema.userIntegrations.provider, "azure-devops"),
        eq(schema.userIntegrations.organization, organization),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return decryptSecret(row.secretEncrypted);
}

export function azureWorkItemUrl(config: AzureDevOpsConfig, workItemId: number): string {
  const organization = encodeURIComponent(config.organization ?? "");
  const project = encodeURIComponent(config.project ?? "");
  return `https://dev.azure.com/${organization}/${project}/_workitems/edit/${workItemId}`;
}

export async function getAzureWorkItem(
  config: AzureDevOpsConfig | null | undefined,
  workItemId: number,
  pat?: string | null,
): Promise<AzureWorkItem | null> {
  if (!isAzureDevOpsConfigured(config, pat) || !config) return null;
  const json = await azureFetch<Record<string, unknown>>(
    config,
    `_apis/wit/workitems/${workItemId}?$select=System.Title,System.State&api-version=7.1`,
    {},
    pat,
  );
  const fields = json.fields as Record<string, unknown> | undefined;
  return {
    id: Number(json.id ?? workItemId),
    url: azureWorkItemUrl(config, workItemId),
    title: typeof fields?.["System.Title"] === "string" ? fields["System.Title"] : undefined,
    state: typeof fields?.["System.State"] === "string" ? fields["System.State"] : undefined,
  };
}

export async function updateAzureWorkItemState(
  config: AzureDevOpsConfig | null | undefined,
  workItemId: number | null,
  status: TaskStatus,
  pat?: string | null,
): Promise<string | null> {
  if (!workItemId || !isAzureDevOpsConfigured(config, pat) || !config) return null;
  const mapped = config.stateMap?.[status] || DEFAULT_STATE_MAP[status];
  if (!mapped) return null;
  await azureFetch(
    config,
    `_apis/wit/workitems/${workItemId}?api-version=7.1`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json-patch+json" },
      body: JSON.stringify([
        { op: "add", path: "/fields/System.State", value: mapped },
      ]),
    },
    pat,
  );
  return mapped;
}

export async function addAzureWorkItemComment(
  config: AzureDevOpsConfig | null | undefined,
  workItemId: number | null,
  markdown: string,
  pat?: string | null,
): Promise<void> {
  if (!workItemId || !isAzureDevOpsConfigured(config, pat) || !config) return;
  await azureFetch(
    config,
    `_apis/wit/workItems/${workItemId}/comments?format=markdown&api-version=7.1-preview.4`,
    {
      method: "POST",
      body: JSON.stringify({ text: markdown }),
    },
    pat,
  );
}

function baseUrl(config: AzureDevOpsConfig): string {
  const organization = encodeURIComponent(config.organization ?? "");
  const project = encodeURIComponent(config.project ?? "");
  return `https://dev.azure.com/${organization}/${project}`;
}

async function azureFetch<T = unknown>(
  config: AzureDevOpsConfig,
  path: string,
  init: RequestInit = {},
  patOverride?: string | null,
): Promise<T> {
  const pat = patOverride || env().AZURE_DEVOPS_PAT;
  if (!pat) throw new Error("AZURE_DEVOPS_PAT is not set");
  const token = Buffer.from(`:${pat}`).toString("base64");
  const res = await fetch(`${baseUrl(config)}/${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      authorization: `Basic ${token}`,
      "content-type": "application/json",
      ...init.headers,
    },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Azure DevOps ${res.status}: ${detail.slice(0, 300)}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
