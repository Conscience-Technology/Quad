# Quad as an Evidence Layer

Quad is not meant to replace Azure DevOps, Jira, GitHub Issues, or any team's source of truth.

It is most useful when the work item already exists, the discussion belongs in that tracker, and the team needs better evidence from the running product:

- the exact page and viewport
- screenshots, recordings, and uploaded files
- reporter text
- console and network context
- DOM selector and source-map hints where available
- related work item numbers when a change spans multiple stories

## Azure DevOps-first workflow

For teams using Azure Boards, the recommended workflow is:

1. Keep policy discussion, story ownership, state, priority, and final decisions in Azure DevOps.
2. In the host app, open the Quad SDK panel.
3. Enter the primary Azure Work Item number.
4. Optionally enter related Work Item numbers when user stories conflict or a policy change touches multiple stories.
5. Add the screen evidence and submit.

Quad then stores the evidence bundle and adds a comment to the primary Azure Work Item. The comment references related Work Items so the Azure thread remains the main place for discussion.

## What Quad should avoid

Quad should not try to become the team's planning system:

- Do not duplicate policy decisions that belong in Azure DevOps.
- Do not force teams to manage parallel task status unless they use Quad's MCP workflow.
- Do not make Quad's board the source of truth for story conflicts.

## Open-source direction

The same model works beyond Azure DevOps. Azure is the current concrete provider, but the product model should remain provider-oriented:

- `issue tracker` owns workflow and discussion
- `Quad` owns evidence capture and replay
- provider adapters sync comments, state, links, and metadata

That keeps Quad useful for Azure-heavy internal teams while still preserving an open-source path for GitHub Issues, Jira, Linear, or other trackers.
