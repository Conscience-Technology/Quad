import { azureDevOpsProvider } from "./azure-devops";
import type { ExternalIssueProvider, IssueProviderId } from "./types";

const issueProviders = [azureDevOpsProvider] as const satisfies readonly ExternalIssueProvider[];

export function listIssueProviders(): readonly ExternalIssueProvider[] {
  return issueProviders;
}

export function getIssueProvider(id: IssueProviderId): ExternalIssueProvider | null {
  return issueProviders.find((provider) => provider.id === id) ?? null;
}

export function requireIssueProvider(id: IssueProviderId): ExternalIssueProvider {
  const provider = getIssueProvider(id);
  if (!provider) throw new Error(`Unknown issue integration provider: ${id}`);
  return provider;
}
