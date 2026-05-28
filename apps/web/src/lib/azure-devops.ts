import type { AzureDevOpsConfig } from "~/db/schema";
import {
  azureDevOpsProvider,
  AZURE_DEVOPS_PROVIDER_ID,
  type AzureWorkItem,
} from "~/server/integrations/azure-devops";
import { getUserIntegrationSecret } from "~/server/integrations/credentials";
import type { TaskStatus } from "~/server/integrations/types";

export type { AzureWorkItem };

export function isAzureDevOpsConfigured(
  config: AzureDevOpsConfig | null | undefined,
  pat?: string | null,
): boolean {
  return azureDevOpsProvider.isConfigured(config, pat);
}

export async function getAzureDevOpsPatForUser(
  userId: string | null | undefined,
  organization: string | null | undefined,
): Promise<string | null> {
  return getUserIntegrationSecret(AZURE_DEVOPS_PROVIDER_ID, userId, organization);
}

export function azureWorkItemUrl(config: AzureDevOpsConfig, workItemId: number): string {
  return azureDevOpsProvider.issueUrl(config, workItemId);
}

export async function getAzureWorkItem(
  config: AzureDevOpsConfig | null | undefined,
  workItemId: number,
  pat?: string | null,
): Promise<AzureWorkItem | null> {
  const issue = await azureDevOpsProvider.getIssue({
    config,
    issueId: workItemId,
    credentials: pat,
  });
  return issue ? { ...issue, id: Number(issue.id) } : null;
}

export async function updateAzureWorkItemState(
  config: AzureDevOpsConfig | null | undefined,
  workItemId: number | null,
  status: TaskStatus,
  pat?: string | null,
): Promise<string | null> {
  return azureDevOpsProvider.updateIssueForTaskStatus({
    config,
    issueId: workItemId,
    status,
    credentials: pat,
  });
}

export async function setAzureWorkItemState(
  config: AzureDevOpsConfig | null | undefined,
  workItemId: number | null,
  state: string | null | undefined,
  pat?: string | null,
): Promise<string | null> {
  return azureDevOpsProvider.setIssueState({
    config,
    issueId: workItemId,
    state,
    credentials: pat,
  });
}

export async function addAzureWorkItemComment(
  config: AzureDevOpsConfig | null | undefined,
  workItemId: number | null,
  markdown: string,
  pat?: string | null,
): Promise<void> {
  await azureDevOpsProvider.addIssueComment({
    config,
    issueId: workItemId,
    markdown,
    credentials: pat,
  });
}
