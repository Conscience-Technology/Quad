# Branching Strategy

Quad uses a small open-source branching model.

## Branches

```txt
main
  Stable and deployable. Protected. No routine direct pushes.

feature/<short-name>
  Product or core feature work.

integration/<provider>
  New integration provider work, for example integration/jira.

fix/<short-name>
  Bug fixes.

release/<version>
  Temporary stabilization branch when a release needs final hardening.

experimental/<short-name>
  Work that is intentionally not ready for normal review.
```

Codex-generated branches should use `codex/<short-name>`.

## Merge Rules

- Open a PR into `main`.
- Require typecheck and production build.
- Squash merge feature and integration branches.
- Keep provider PRs scoped to one external system at a time.
- Do not mix provider framework refactors with a new provider unless the PR is
  explicitly a framework refactor.

## Provider PR Checklist

- Provider implements `ExternalIssueProvider`.
- Provider is registered in `server/integrations/registry.ts`.
- Project settings explain required config and credentials.
- Credentials are encrypted and never stored in project config.
- State mapping is configurable.
- Remote API failures are surfaced as sync metadata, not fatal Quad task errors
  unless the user explicitly initiated the sync action.
