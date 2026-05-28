# MCP Troubleshooting

Run this first:

```bash
npx quad doctor
```

or from an MCP-capable agent:

```txt
quad_doctor
```

## Common Failures

### No projects are available

The MCP key is valid but is not scoped to any project. Open Account → MCP keys
and attach the key to at least one project, or use a super-admin key.

### No queued tasks

The key and project scope work, but there is nothing to pick. Create a task from
a bug report or list another status:

```bash
npx quad list --status picked
```

### Integration credential missing

Project integration config exists, but Quad cannot call the external provider.

For Azure DevOps, either:

- save a personal PAT in Account → MCP keys, or
- set `AZURE_DEVOPS_PAT` on the server for bot-style SDK/report sync.

Minimum Azure DevOps PAT scope: Work Items read/write.

### Provider state update fails

Check the project integration state mapping. External workflow names are plain
strings and must match the provider's configured workflow exactly.

Use:

```bash
npx quad integration test --project <project-id> --issue <issue-id>
```
