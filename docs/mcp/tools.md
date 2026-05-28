# MCP Tools

Quad's MCP server is designed for two workflows:

1. Agent task execution: pick a task, read the report bundle, update status,
   and comment back.
2. Open-source QA: diagnose instance setup and integration failures without
   opening the dashboard.

## Setup / QA

- `quad_doctor`
  - Checks endpoint connectivity, MCP key validity, project scope, queued task
    counts, and configured issue integrations.
- `quad_list_integrations`
  - Lists provider config per accessible project, including credential source.
- `quad_test_integration`
  - Tests provider credentials and optionally a specific issue/work item id.

## Task Workflow

- `quad_list_tasks`
- `quad_search_tasks`
- `quad_pick_task`
  - Starts a finite lease so stale picked tasks can be reclaimed.
- `quad_renew_task`
  - Renews the lease for a picked task.
- `quad_get_task`
- `quad_update_task`
- `quad_post_comment`

`quad_update_task` accepts only:

```txt
queued | picked | in_progress | pr_open | done | wont_do
```

If a task has an external issue linked, status/comment operations return
`externalIssue` sync metadata. Legacy Azure fields remain for compatibility but
new clients should read `externalIssue`.

## External Issues

- `quad_link_issue`
  - Links a task to an external issue provider. Built-in providers include
    Azure DevOps, GitHub Issues, and the mock provider. The response includes
    provider, id, URL, title, previous state, target state, and sync result.

## Report Context

- `quad_get_frames`
- `quad_get_transcript`
- `quad_get_timeline`
- `quad_get_source`

These tools pull extra context when the initial `quad_get_task` response is not
enough.
