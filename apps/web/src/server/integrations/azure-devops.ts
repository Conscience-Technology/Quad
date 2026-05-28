import type { AzureDevOpsConfig } from "~/db/schema";
import { env } from "~/lib/env";
import type { ExternalIssue, ExternalIssueProvider, TaskStatus } from "./types";

export type AzureDevOpsCredentials = string;

export const AZURE_DEVOPS_PROVIDER_ID = "azure-devops" as const;

const DEFAULT_STATE_MAP: Record<TaskStatus, string> = {
  queued: "To Do",
  picked: "In Progress",
  in_progress: "In Progress",
  pr_open: "Reviewed",
  done: "Done",
  wont_do: "Resolved",
};

export const azureDevOpsProvider: ExternalIssueProvider<
  AzureDevOpsConfig,
  AzureDevOpsCredentials
> = {
  id: AZURE_DEVOPS_PROVIDER_ID,
  name: "Azure DevOps",
  issueLabel: "Azure Boards work item",
  envCredentialName: "AZURE_DEVOPS_PAT",

  isConfigured(config, credentials) {
    return !!(
      config?.enabled &&
      config.organization?.trim() &&
      config.project?.trim() &&
      (credentials || env().AZURE_DEVOPS_PAT)
    );
  },

  issueUrl(config, issueId) {
    const organization = encodeURIComponent(config.organization ?? "");
    const project = encodeURIComponent(config.project ?? "");
    return `https://dev.azure.com/${organization}/${project}/_workitems/edit/${issueId}`;
  },

  reportState(config) {
    return config?.reportState?.trim() || "Reopened";
  },

  mapTaskStatus(config, status) {
    return config?.stateMap?.[status] || DEFAULT_STATE_MAP[status] || null;
  },

  async getIssue({ config, issueId, credentials }) {
    if (!issueId || !this.isConfigured(config, credentials) || !config) return null;
    const json = await azureFetch<Record<string, unknown>>(
      config,
      `_apis/wit/workitems/${issueId}?$select=System.Title,System.State&api-version=7.1`,
      {},
      credentials,
    );
    const fields = json.fields as Record<string, unknown> | undefined;
    return {
      id: Number(json.id ?? issueId),
      url: this.issueUrl(config, issueId),
      title: typeof fields?.["System.Title"] === "string" ? fields["System.Title"] : undefined,
      state: typeof fields?.["System.State"] === "string" ? fields["System.State"] : undefined,
    };
  },

  async testConnection({ config, credentials }) {
    if (!this.isConfigured(config, credentials) || !config) {
      throw new Error("Azure DevOps project config or credential is missing");
    }
    await azureFetch<Record<string, unknown>>(
      config,
      "_apis/wit/workitemtypes?$top=1&api-version=7.1",
      {},
      credentials,
    );
    return { ok: true, message: "Azure DevOps project and credential are valid" };
  },

  async setIssueState({ config, issueId, state, credentials }) {
    if (!issueId || !state || !this.isConfigured(config, credentials) || !config) return null;
    await azureFetch(
      config,
      `_apis/wit/workitems/${issueId}?api-version=7.1`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json-patch+json" },
        body: JSON.stringify([
          { op: "add", path: "/fields/System.State", value: state },
        ]),
      },
      credentials,
    );
    return state;
  },

  async updateIssueForTaskStatus({ config, issueId, status, credentials }) {
    const state = this.mapTaskStatus(config, status);
    return this.setIssueState({ config, issueId, state, credentials });
  },

  async addIssueComment({ config, issueId, markdown, credentials }) {
    if (!issueId || !this.isConfigured(config, credentials) || !config) return;
    await azureFetch(
      config,
      `_apis/wit/workItems/${issueId}/comments?format=markdown&api-version=7.1-preview.4`,
      {
        method: "POST",
        body: JSON.stringify({ text: markdown }),
      },
      credentials,
    );
  },
};

function baseUrl(config: AzureDevOpsConfig): string {
  const organization = encodeURIComponent(config.organization ?? "");
  const project = encodeURIComponent(config.project ?? "");
  return `https://dev.azure.com/${organization}/${project}`;
}

async function azureFetch<T = unknown>(
  config: AzureDevOpsConfig,
  path: string,
  init: RequestInit = {},
  credentials?: AzureDevOpsCredentials | null,
): Promise<T> {
  const pat = credentials || env().AZURE_DEVOPS_PAT;
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

export type AzureWorkItem = ExternalIssue & { id: number };
