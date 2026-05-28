import { and, eq } from "drizzle-orm";
import { db, schema } from "~/db";
import type {
  AzureDevOpsConfig,
  Project,
  ProjectIntegrationConfig,
  Task,
  TaskExternalIssue,
} from "~/db/schema";
import { env } from "~/lib/env";
import { AZURE_DEVOPS_PROVIDER_ID } from "./azure-devops";
import { GITHUB_ISSUES_PROVIDER_ID, type GitHubIssuesConfig } from "./github-issues";
import { MOCK_PROVIDER_ID, type MockIssueConfig } from "./mock";
import type { ExternalIssue, ExternalIssueProvider, IssueProviderId } from "./types";

export type UpsertExternalIssueInput = {
  taskId: string;
  provider: IssueProviderId;
  externalId: string | number;
  externalUrl?: string | null;
  title?: string | null;
  state?: string | null;
  syncStatus?: string;
  syncError?: string | null;
  meta?: Record<string, unknown>;
};

export async function getProjectIntegrationConfig<T extends ProjectIntegrationConfig>(
  projectId: string,
  provider: IssueProviderId,
): Promise<T | null> {
  const [integration] = await db
    .select()
    .from(schema.projectIntegrations)
    .where(
      and(
        eq(schema.projectIntegrations.projectId, projectId),
        eq(schema.projectIntegrations.provider, provider),
      ),
    )
    .limit(1);
  if (!integration) return null;
  return {
    ...integration.config,
    enabled: integration.enabled,
  } as unknown as T;
}

export async function getAzureDevOpsConfig(project: Pick<Project, "id" | "azureDevOps">) {
  return (
    await getProjectIntegrationConfig<AzureDevOpsConfig>(
      project.id,
      AZURE_DEVOPS_PROVIDER_ID,
    )
  ) ?? project.azureDevOps;
}

export async function saveProjectIntegrationConfig(
  projectId: string,
  provider: IssueProviderId,
  config: ProjectIntegrationConfig | null | undefined,
) {
  const enabled = (config as { enabled?: unknown } | null | undefined)?.enabled === true;
  await db
    .insert(schema.projectIntegrations)
    .values({
      projectId,
      provider,
      enabled,
      config: config ?? {},
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [schema.projectIntegrations.projectId, schema.projectIntegrations.provider],
      set: {
        enabled,
        config: config ?? {},
        updatedAt: new Date(),
      },
    });
}

export async function getTaskExternalIssue(
  taskId: string,
  provider?: IssueProviderId,
): Promise<TaskExternalIssue | null> {
  const where = provider
    ? and(
        eq(schema.taskExternalIssues.taskId, taskId),
        eq(schema.taskExternalIssues.provider, provider),
      )
    : eq(schema.taskExternalIssues.taskId, taskId);
  const [issue] = await db
    .select()
    .from(schema.taskExternalIssues)
    .where(where)
    .limit(1);
  return issue ?? null;
}

export async function upsertTaskExternalIssue(input: UpsertExternalIssueInput) {
  const now = new Date();
  const meta = input.meta ?? {};
  const [issue] = await db
    .insert(schema.taskExternalIssues)
    .values({
      taskId: input.taskId,
      provider: input.provider,
      externalId: String(input.externalId),
      externalUrl: input.externalUrl ?? null,
      title: input.title ?? null,
      state: input.state ?? null,
      syncStatus: input.syncStatus ?? "unknown",
      syncError: input.syncError ?? null,
      meta,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [schema.taskExternalIssues.taskId, schema.taskExternalIssues.provider],
      set: {
        externalId: String(input.externalId),
        externalUrl: input.externalUrl ?? null,
        title: input.title ?? null,
        state: input.state ?? null,
        syncStatus: input.syncStatus ?? "unknown",
        syncError: input.syncError ?? null,
        meta,
        updatedAt: now,
      },
    })
    .returning();
  return issue;
}

export function externalIssuePayload(
  task: Pick<Task, "azureWorkItemId" | "azureWorkItemUrl">,
  issue: TaskExternalIssue | null | undefined,
): (ExternalIssue & {
  provider: IssueProviderId;
  syncStatus?: string;
  syncError?: string | null;
}) | null {
  if (issue) {
    return {
      provider: issue.provider,
      id: issue.externalId,
      url: issue.externalUrl ?? "",
      title: issue.title ?? undefined,
      state: issue.state ?? undefined,
      syncStatus: issue.syncStatus,
      syncError: issue.syncError,
    };
  }
  if (task.azureWorkItemId) {
    return {
      provider: AZURE_DEVOPS_PROVIDER_ID,
      id: task.azureWorkItemId,
      url: task.azureWorkItemUrl ?? "",
    };
  }
  return null;
}

export async function credentialForProvider(
  provider: ExternalIssueProvider,
  userId: string,
  config: unknown,
): Promise<string | null> {
  const { getUserIntegrationSecret } = await import("./credentials");
  if (provider.id === AZURE_DEVOPS_PROVIDER_ID) {
    const organization = (config as AzureDevOpsConfig | null | undefined)?.organization;
    return (await getUserIntegrationSecret(provider.id, userId, organization)) ?? env().AZURE_DEVOPS_PAT ?? null;
  }
  if (provider.id === GITHUB_ISSUES_PROVIDER_ID) {
    const github = config as GitHubIssuesConfig | null | undefined;
    const organization = github?.owner;
    return (await getUserIntegrationSecret(provider.id, userId, organization)) ?? env().GITHUB_TOKEN ?? null;
  }
  if (provider.id === MOCK_PROVIDER_ID) return null;
  return null;
}

export function providerConfigFromProject(
  project: Pick<Project, "id" | "azureDevOps">,
  provider: IssueProviderId,
  integrationConfig: ProjectIntegrationConfig | null,
) {
  if (integrationConfig) return integrationConfig;
  if (provider === AZURE_DEVOPS_PROVIDER_ID) return project.azureDevOps;
  return null;
}

export type KnownProviderConfig = AzureDevOpsConfig | GitHubIssuesConfig | MockIssueConfig;
