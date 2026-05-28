# Integration Provider and MCP QA Improvements

This document summarizes the open-source readiness work introduced on
`codex/integration-provider-structure`.

## Why This Exists

Quad originally had one concrete external tracker integration: Azure DevOps.
That worked for a single deployment, but it made future Jira, GitHub Issues,
Linear, or custom self-hosted providers harder to add cleanly.

This work separates Quad core from external issue tracker providers, improves
the dashboard setup experience, and adds MCP/CLI diagnostics so self-hosted
users can debug configuration problems without maintainer help.

## Commits

```txt
df12c4d add integration provider structure
449451a improve integration setup ux
cef33d9 add mcp qa and integration tools
34148dd document integration provider mcp qa work
```

## Provider Architecture

New provider code lives under:

```txt
apps/web/src/server/integrations/
  types.ts
  registry.ts
  credentials.ts
  azure-devops.ts
  github-issues.ts
  mock.ts
  store.ts
```

Key changes:

- Added `ExternalIssueProvider` as the shared contract for issue tracker
  integrations.
- Moved Azure DevOps API behavior into `azure-devops.ts`.
- Kept `apps/web/src/lib/azure-devops.ts` as a compatibility wrapper so
  existing callers keep working while new providers use the generic provider
  model.
- Added shared encrypted credential lookup through `credentials.ts`.
- Added `registry.ts` as the provider discovery point.
- Added `store.ts` to keep provider config and external issue links out of
  Azure-specific project/task columns.

Current built-in providers:

```txt
azure-devops
github-issues
mock
```

The provider contract currently covers:

- config/credential readiness
- issue URL generation
- issue lookup
- report-submitted state
- Quad task status to external state mapping
- state updates
- comment sync
- connection testing

## Dashboard UX

Project Settings now better supports self-hosted setup and integration QA.

Improvements:

- Added a setup checklist:
  - project created
  - SDK origin configured
  - repository mapping configured
  - issue tracker configured
  - Azure DevOps connection tested
- Reframed Azure DevOps under an `Integrations` section instead of treating it
  as a one-off setting.
- Added `Test connection`.
  - Can test project/credential access.
  - Can optionally test a specific Work Item.
  - Shows credential source: user PAT, server PAT, or missing.
- Improved Report detail sync status.
  - Shows `External Issue` instead of only `Azure DevOps`.
  - Explains why sync was skipped or failed.
  - Provides the next action when PAT/config is missing.
- Improved Task detail external issue UX.
  - Replaced Azure-specific labels with `External Issue`.
  - Shows linked issue status and sync hints.
  - Renamed `Confirm → Task` to `Create Task`.
- Updated SDK panel copy.
  - Bug Mode instruction now matches the current click-to-pin behavior.
  - Work item input is labeled `Issue / Work item #`.

## MCP REST API Additions

New endpoints:

```txt
GET  /api/mcp/doctor
GET  /api/mcp/integrations
POST /api/mcp/integrations
POST /api/mcp/tasks/:id/issue
POST /api/mcp/tasks/:id/lease
```

Changed endpoints:

```txt
GET  /api/mcp/tasks
GET  /api/mcp/tasks/:id
POST /api/mcp/tasks/:id/status
POST /api/mcp/tasks/:id/comment
```

These now include or return `externalIssue` metadata where applicable.

Example shape:

```json
{
  "externalIssue": {
    "provider": "azure-devops",
    "id": 8995,
    "url": "https://dev.azure.com/...",
    "synced": true,
    "state": "Reopened"
  }
}
```

Legacy Azure-specific fields remain for compatibility:

```txt
azureWorkItemId
azureWorkItemUrl
azureDevOps
```

New clients should prefer `externalIssue`.

## MCP Tool Additions

MCP tool count increased from 10 to 14.

New tools:

```txt
quad_doctor
quad_list_integrations
quad_test_integration
quad_link_issue
quad_renew_task
```

Existing tool improvements:

- `quad_update_task` now has an enum status schema.
- `quad_update_task` returns external issue sync metadata.
- `quad_pick_task` now correctly maps MCP `project_id` / `task_id` arguments to
  the REST API's `projectId` / `taskId` body.
- Task reads and task lists include `externalIssue`.
- `quad_pick_task` now starts a finite lease.
- `quad_renew_task` renews a picked task lease.

## CLI Additions

New commands:

```bash
quad doctor
quad integration list
quad integration test --project <project-id> --issue <issue-id>
quad issue link <task-id> <issue-id>
quad lease <task-id> --minutes 30
```

Improved commands:

- `quad status` prints external issue sync results when present.
- `quad comment` prints external issue sync results when present.

These commands are intended to make self-hosted troubleshooting possible before
opening the dashboard or attaching a debugger.

## Documentation Added

```txt
docs/branching.md
docs/integrations/overview.md
docs/integrations/creating-provider.md
docs/mcp/tools.md
docs/mcp/troubleshooting.md
docs/mcp/cli.md
```

`README.md` and `CONTRIBUTING.md` now link to the provider and MCP docs.

## Branching Policy

The documented open-source branch model is now:

```txt
main
feature/<short-name>
integration/<provider>
fix/<short-name>
release/<version>
experimental/<short-name>
codex/<short-name>
```

Provider work should use `integration/<provider>` unless it is Codex-generated,
in which case `codex/<short-name>` is acceptable.

## Validation

Validated locally:

```bash
pnpm -r typecheck
pnpm test:providers
pnpm --filter @quad/mcp build
pnpm --filter @quad/cli build
pnpm --filter @quad/sdk build
pnpm --filter @quad/web build
```

The Next.js build confirms the new MCP API routes are included:

```txt
/api/mcp/doctor
/api/mcp/integrations
/api/mcp/tasks/[id]/issue
/api/mcp/tasks/[id]/lease
```

## Completed Follow-Ups

The follow-ups below were implemented after the initial provider/MCP work:

- Added provider conformance tests through `pnpm test:providers`.
- Added a mock provider for local development and CI.
- Added lease/expiry semantics for picked tasks.
- Migrated project integration config from `projects.azureDevOps` into a generic
  `project_integrations` table.
- Added `task_external_issues` as the external issue database model while
  keeping Azure-specific task columns as compatibility fields.
- Added GitHub Issues as the second real provider to prove the abstraction.

## Compatibility Notes

`projects.azureDevOps`, `tasks.azureWorkItemId`, and `tasks.azureWorkItemUrl`
still exist for old deployments and dashboard paths. New MCP/API paths prefer:

```txt
project_integrations
task_external_issues
```

The `0006_generic_integrations_and_leases` migration copies existing Azure
config and task links into the generic tables so old data remains visible after
deploy.
