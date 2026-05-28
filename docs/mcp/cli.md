# CLI QA Commands

The CLI wraps the same `/api/mcp/*` endpoints used by the MCP server.

```bash
npx quad login --endpoint https://quad.example.com --key qd_mcp_...
npx quad doctor
npx quad list --status to_do
npx quad pull --next
npx quad status <task-id> --set in_progress
npx quad comment <task-id> "Started investigation"
npx quad integration list
npx quad integration test --project <project-id> --issue 8995
npx quad issue link <task-id> 8995
```

`doctor`, `integration test`, and `issue link` are the recommended first checks
when validating a self-hosted install.
