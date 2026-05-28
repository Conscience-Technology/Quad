import assert from "node:assert/strict";
import { azureDevOpsProvider } from "../src/server/integrations/azure-devops";
import { githubIssuesProvider } from "../src/server/integrations/github-issues";
import { mockIssueProvider } from "../src/server/integrations/mock";
import { getIssueProvider, listIssueProviders } from "../src/server/integrations/registry";
import type { ExternalIssueProvider, TaskStatus } from "../src/server/integrations/types";

const statuses: TaskStatus[] = [
  "to_do",
  "in_progress",
  "reviewed",
  "resolved",
  "published",
  "done",
  "canceled",
];

async function main() {
  assert.ok(getIssueProvider("azure-devops"));
  assert.ok(getIssueProvider("github-issues"));
  assert.ok(getIssueProvider("mock"));
  assert.equal(listIssueProviders().length >= 3, true);

  assertProviderShape(azureDevOpsProvider);
  assertProviderShape(githubIssuesProvider);
  assertProviderShape(mockIssueProvider);

  await checkMockProvider();
  checkAzureDevOpsProvider();
  checkGitHubIssuesProvider();

  console.log("provider contracts ok");
}

function assertProviderShape(provider: ExternalIssueProvider) {
  assert.equal(typeof provider.id, "string");
  assert.equal(typeof provider.name, "string");
  assert.equal(typeof provider.issueLabel, "string");
  assert.equal(typeof provider.isConfigured, "function");
  assert.equal(typeof provider.issueUrl, "function");
  assert.equal(typeof provider.reportState, "function");
  assert.equal(typeof provider.mapTaskStatus, "function");
  assert.equal(typeof provider.getIssue, "function");
  assert.equal(typeof provider.setIssueState, "function");
  assert.equal(typeof provider.updateIssueForTaskStatus, "function");
  assert.equal(typeof provider.addIssueComment, "function");
}

async function checkMockProvider() {
  const config = { enabled: true, baseUrl: "https://quad.test", reportState: "Review" };
  assert.equal(mockIssueProvider.isConfigured(config), true);
  assert.equal(mockIssueProvider.issueUrl(config, 123), "https://quad.test/issues/123");
  assert.equal(mockIssueProvider.reportState(config), "Review");
  for (const status of statuses) {
    assert.equal(typeof mockIssueProvider.mapTaskStatus(config, status), "string");
  }
  const issue = await mockIssueProvider.getIssue({ config, issueId: 123 });
  assert.deepEqual(issue, {
    id: 123,
    url: "https://quad.test/issues/123",
    title: "Mock issue #123",
    state: "Open",
  });
  assert.equal(
    await mockIssueProvider.updateIssueForTaskStatus({ config, issueId: 123, status: "done" }),
    "Done",
  );
  await mockIssueProvider.addIssueComment({ config, issueId: 123, markdown: "ok" });
}

function checkAzureDevOpsProvider() {
  const config = {
    enabled: true,
    organization: "SG-Collaboration-Projects",
    project: "CURECA",
    reportState: "Reopened",
  };
  assert.equal(azureDevOpsProvider.issueUrl(config, 8995), "https://dev.azure.com/SG-Collaboration-Projects/CURECA/_workitems/edit/8995");
  assert.equal(azureDevOpsProvider.reportState(config), "Reopened");
  assert.equal(azureDevOpsProvider.mapTaskStatus(config, "done"), "Done");
  assert.equal(azureDevOpsProvider.isConfigured({ ...config, enabled: false }, "token"), false);
}

function checkGitHubIssuesProvider() {
  const config = {
    enabled: true,
    owner: "Conscience-Technology",
    repo: "Quad",
    reportState: "open",
  };
  assert.equal(githubIssuesProvider.issueUrl(config, 17), "https://github.com/Conscience-Technology/Quad/issues/17");
  assert.equal(githubIssuesProvider.reportState(config), "open");
  assert.equal(githubIssuesProvider.mapTaskStatus(config, "done"), "closed");
  assert.equal(githubIssuesProvider.mapTaskStatus(config, "to_do"), "open");
  assert.equal(githubIssuesProvider.isConfigured(config, "token"), true);
  assert.equal(githubIssuesProvider.isConfigured({ ...config, repo: "" }, "token"), false);
}

await main();
