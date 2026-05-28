# Creating an Issue Provider

Use Azure DevOps as the reference implementation:

```txt
apps/web/src/server/integrations/azure-devops.ts
```

## 1. Implement the Contract

Create a provider module under `apps/web/src/server/integrations/`.

```ts
import type { ExternalIssueProvider } from "./types";

export const myProvider: ExternalIssueProvider<MyConfig, MyCredentials> = {
  id: "my-provider",
  name: "My Provider",
  issueLabel: "Issue",

  isConfigured(config, credentials) {
    return Boolean(config?.enabled && credentials);
  },

  issueUrl(config, issueId) {
    return `https://example.com/issues/${issueId}`;
  },

  reportState(config) {
    return config?.reportState ?? null;
  },

  mapTaskStatus(config, status) {
    return config?.stateMap?.[status] ?? null;
  },

  async getIssue(input) {
    // Fetch issue metadata.
    return null;
  },

  async setIssueState(input) {
    // Update remote state.
    return input.state ?? null;
  },

  async updateIssueForTaskStatus(input) {
    const state = this.mapTaskStatus(input.config, input.status);
    return this.setIssueState({ ...input, state });
  },

  async addIssueComment(input) {
    // Add remote comment.
  },
};
```

## 2. Register It

Add the provider to `apps/web/src/server/integrations/registry.ts`.

## 3. Store Credentials

Use `user_integrations` for encrypted per-user credentials. Use
`getUserIntegrationSecret(providerId, userId, organization)` when a provider has
an organization/workspace boundary.

## 4. Add Project Settings

Project settings should collect:

- Provider enabled flag
- Organization/workspace/project keys
- Report-submitted target state
- Quad task status to external status mapping

Keep external state values as strings. Providers should not require Quad to know
their workflow enum.

## 5. Add Tests or a Mock

Provider code should be testable without calling the remote API. Keep URL
builders, state mapping, and config checks as pure functions where possible.
