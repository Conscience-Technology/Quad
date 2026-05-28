# Integration Providers

Quad core owns bug capture, task creation, comments, and task status. External
systems such as Azure DevOps, Jira, GitHub Issues, and Linear are integration
providers.

Provider code lives under:

```txt
apps/web/src/server/integrations/
  types.ts          # shared provider contract
  registry.ts       # provider discovery
  credentials.ts    # encrypted per-user credentials
  store.ts          # generic project config + task issue links
  azure-devops.ts
  github-issues.ts
  mock.ts
```

Generic project config is stored in `project_integrations`. Generic task links
are stored in `task_external_issues`. Azure-specific columns still exist for
backwards compatibility and are copied into the generic tables by migration.

Built-in providers:

```txt
azure-devops
github-issues
mock
```

## Provider Responsibilities

An issue provider should implement the smallest common workflow Quad needs:

1. Validate whether project config and credentials are usable.
2. Resolve an external issue/work item by number.
3. Build the external issue URL.
4. Add a Quad-authored comment to the external issue.
5. Set the external issue state for report submissions.
6. Map Quad task statuses to external workflow states.

Providers should not know about Quad database tables, task routers, or SDK
payloads. Callers translate Quad events into provider calls.

## Credentials

User-specific secrets are stored in `user_integrations` and encrypted with
`SESSION_SECRET`.

For SDK report submissions, there may be no logged-in Quad user. Providers can
support a server-side bot credential through an env var, for example
`AZURE_DEVOPS_PAT` or `GITHUB_TOKEN`. Dashboard and MCP actions should prefer
the acting user's credential, then fall back only where the provider explicitly
supports it.

## State Mapping

External workflow states are not portable. Quad task states must be mapped per
project:

```txt
report_submitted -> Reopened
queued           -> To Do
picked           -> In Progress
in_progress      -> In Progress
pr_open          -> Reviewed
done             -> Done
wont_do          -> Resolved
```

Do not hard-code a provider's workflow into Quad task status enums.
