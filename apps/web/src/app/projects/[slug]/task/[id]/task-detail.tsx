"use client";

import { useState } from "react";
import { Button, Code, Field, Input, Surface, Textarea } from "~/components/ui";
import { trpc } from "~/lib/trpc/react";

type Status = "to_do" | "in_progress" | "reviewed" | "resolved" | "published" | "done" | "canceled";
type AzureIdentity = {
  id: string;
  displayName: string;
  uniqueName?: string;
  imageUrl?: string;
};

const STATUS_LABELS: Record<Status, string> = {
  to_do: "To Do",
  in_progress: "In Progress",
  reviewed: "Reviewed",
  resolved: "Resolved",
  published: "Published",
  done: "Done",
  canceled: "Canceled",
};

export function TaskDetail({
  projectId,
  projectSlug,
  taskId,
}: {
  projectId: string;
  projectSlug: string;
  taskId: string;
}) {
  const q = trpc.tasks.byId.useQuery({ projectId, taskId });
  const utils = trpc.useUtils();
  const update = trpc.tasks.updateStatus.useMutation({
    onSettled: () => utils.tasks.byId.invalidate({ projectId, taskId }),
  });
  const linkExternalIssue = trpc.tasks.linkAzureWorkItem.useMutation({
    onSettled: () => utils.tasks.byId.invalidate({ projectId, taskId }),
  });
  const addAzureComment = trpc.tasks.addAzureComment.useMutation({
    onSuccess: () => {
      setAzureComment("");
      setMentionQuery("");
      setSelectedMentions([]);
    },
    onSettled: () => utils.tasks.byId.invalidate({ projectId, taskId }),
  });
  const [prUrl, setPrUrl] = useState("");
  const [externalIssueId, setExternalIssueId] = useState("");
  const [azureComment, setAzureComment] = useState("");
  const [mentionQuery, setMentionQuery] = useState("");
  const [selectedMentions, setSelectedMentions] = useState<AzureIdentity[]>([]);

  const identitySearch = trpc.tasks.searchAzureIdentities.useQuery(
    { projectId, query: mentionQuery.trim() },
    { enabled: mentionQuery.trim().length >= 2 },
  );

  if (q.isLoading) return <p className="text-sm text-[var(--color-star-500)]">…</p>;
  if (!q.data) return null;
  const { task, briefUrl, markdown, events } = q.data;
  const externalIssue = task.externalIssue;
  const connectedWorkItemId = task.azureWorkItemId ?? externalIssue?.id;
  const connectedWorkItemUrl = task.azureWorkItemUrl || externalIssue?.url;
  const canPostAzureComment = Boolean(task.azureWorkItemId);

  return (
    <div className="grid max-w-7xl gap-8 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-6 min-w-0">
        <header className="space-y-2">
          <p className="text-xs text-[var(--color-star-500)] uppercase tracking-wide">
            task · {task.status}
          </p>
          <h1 className="max-w-4xl text-2xl tracking-tight">{task.title}</h1>
        </header>

        {task.maintainerInstruction && (
          <Surface>
            <p className="text-xs uppercase tracking-wide text-[var(--color-star-500)] mb-2">
              Maintainer instruction
            </p>
            <p className="text-sm text-[var(--color-star-300)]">{task.maintainerInstruction}</p>
          </Surface>
        )}

        <Surface className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-wide text-[var(--color-star-500)]">
              Task Brief (LLM-ready bundle)
            </p>
            <a
              href={briefUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-[var(--color-nebula-cyan)] hover:text-[var(--color-star-100)]"
            >
              raw ↗
            </a>
          </div>
          <Code className="block break-all text-[10px]">{task.briefStorageKey}</Code>
          {markdown ? (
            <pre className="text-xs font-mono whitespace-pre-wrap text-[var(--color-star-300)] max-h-[600px] overflow-y-auto bg-[var(--color-space-void)] p-4 rounded border border-[var(--color-space-border)]">
              {markdown}
            </pre>
          ) : (
            <p className="text-xs text-[var(--color-star-500)]">Failed to load brief.</p>
          )}
        </Surface>

        {events.length > 0 && (
          <Surface className="space-y-2">
            <p className="text-xs uppercase tracking-wide text-[var(--color-star-500)]">
              Activity · {events.length}
            </p>
            {events.map((e) => (
              <div
                key={e.id}
                className="text-xs font-mono text-[var(--color-star-500)] flex justify-between gap-3 py-1 border-t border-[var(--color-space-border)] first:border-0"
              >
                <span className="text-[var(--color-star-300)]">{e.kind}</span>
                <span>
                  {e.actorApiKeyId ? "mcp" : e.actorUserId ? "user" : "system"}
                </span>
                <span>{e.createdAt.toISOString().replace("T", " ").slice(0, 19)}</span>
              </div>
            ))}
          </Surface>
        )}

        <Surface className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-[var(--color-star-500)]">How to use with Claude Code</p>
          <pre className="text-xs font-mono whitespace-pre-wrap text-[var(--color-star-300)]">
{`# If Quad MCP is connected:
"pick the next Quad task and fix it"
# → quad_pick_task → brief + frames + timeline → PR

# Or via CLI:
npx quad pull ${task.id}
# .quad/tasks/${task.id}/TASK_BRIEF.md and frames/ are created.`}
          </pre>
        </Surface>

        <p className="text-xs text-[var(--color-star-500)] font-mono">
          ← <a className="text-[var(--color-star-300)] hover:text-[var(--color-star-100)]" href={`/projects/${projectSlug}/bug/${task.bugReportId}`}>Source bug</a>
        </p>
      </div>

      <aside className="space-y-4 xl:sticky xl:top-16 xl:self-start">
        <Surface className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-medium text-star-100">Azure DevOps</h2>
            {connectedWorkItemId && (
              <span className="rounded border border-nebula-cyan/20 bg-nebula-cyan/10 px-1.5 py-0.5 text-2xs uppercase tracking-wider text-nebula-cyan">
                linked
              </span>
            )}
          </div>
          <Field
            label="Azure Work Item"
            hint="Enter a number once. Quad links the task, moves Azure Boards to the report-submitted state, and adds a trace comment."
          >
            <Input
              type="number"
              min="1"
              value={externalIssueId}
              onChange={(e) => setExternalIssueId(e.currentTarget.value)}
              placeholder={connectedWorkItemId ? String(connectedWorkItemId) : "8743"}
            />
          </Field>
          <Button
            variant="primary"
            className="w-full"
            disabled={!externalIssueId || linkExternalIssue.isPending}
            onClick={() =>
              linkExternalIssue.mutate({
                projectId,
                taskId,
                workItemId: Number.parseInt(externalIssueId, 10),
              })
            }
          >
            {linkExternalIssue.isPending ? "…" : "Find & Link Work Item"}
          </Button>
          {linkExternalIssue.error && (
            <p className="text-xs text-[var(--color-nebula-rose)]">
              {linkExternalIssue.error.message}
            </p>
          )}
          {linkExternalIssue.isSuccess && (
            <p className="text-xs text-[var(--color-nebula-cyan)]">
              Linked and synced with Azure DevOps.
            </p>
          )}
          {connectedWorkItemId && (
            <div className="rounded-md border border-space-border bg-space-void p-3 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-2xs uppercase tracking-wider text-[var(--color-star-500)]">
                    Connected
                  </p>
                  <p className="text-sm text-star-100 truncate">
                    #{connectedWorkItemId}
                    {externalIssue?.state ? (
                      <span className="text-star-500"> · {externalIssue.state}</span>
                    ) : null}
                  </p>
                </div>
                {externalIssue?.syncStatus && (
                  <span className="text-2xs uppercase tracking-wider text-star-500">
                    {externalIssue.syncStatus}
                  </span>
                )}
              </div>
              {externalIssue?.title && (
                <p className="text-xs text-star-300 leading-relaxed">{externalIssue.title}</p>
              )}
              {externalIssue?.syncError && (
                <p className="text-xs text-nebula-rose">{externalIssue.syncError}</p>
              )}
              {connectedWorkItemUrl && (
              <a
                href={connectedWorkItemUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-[var(--color-nebula-cyan)] hover:text-[var(--color-star-100)] break-all block"
              >
                Open in Azure DevOps ↗
              </a>
              )}
            </div>
          )}
        </Surface>

        <Surface className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-medium text-star-100">Comment</h2>
            {selectedMentions.length > 0 && (
              <span className="text-2xs text-star-500">{selectedMentions.length} mention</span>
            )}
          </div>
          <Field
            label="Azure Comment"
            hint={
              canPostAzureComment
                ? "Search by name or email to mention Azure DevOps users, then post directly to the linked Work Item."
                : "Link an Azure Work Item before posting comments."
            }
          >
            <Input
              type="text"
              value={mentionQuery}
              onChange={(e) => setMentionQuery(e.currentTarget.value)}
              disabled={!canPostAzureComment}
              placeholder="@ name or email"
            />
          </Field>
          {selectedMentions.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selectedMentions.map((mention) => (
                <button
                  type="button"
                  key={mention.id}
                  className="rounded-md border border-space-border bg-space-void px-2 py-1 text-xs text-star-300 hover:text-star-100"
                  onClick={() =>
                    setSelectedMentions((current) =>
                      current.filter((item) => item.id !== mention.id),
                    )
                  }
                >
                  @{mention.displayName} ×
                </button>
              ))}
            </div>
          )}
          {canPostAzureComment && mentionQuery.trim().length >= 2 && (
            <div className="max-h-44 overflow-y-auto rounded-md border border-space-border bg-space-void">
              {identitySearch.isLoading && (
                <p className="p-3 text-xs text-star-500">Searching Azure DevOps…</p>
              )}
              {identitySearch.error && (
                <p className="p-3 text-xs text-nebula-rose">{identitySearch.error.message}</p>
              )}
              {identitySearch.data?.map((identity) => {
                const selected = selectedMentions.some((item) => item.id === identity.id);
                return (
                  <button
                    type="button"
                    key={identity.id}
                    disabled={selected}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-star-300 hover:bg-space-hover disabled:opacity-45"
                    onClick={() => {
                      if (!selected) setSelectedMentions((current) => [...current, identity]);
                      setMentionQuery("");
                    }}
                  >
                    {identity.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={identity.imageUrl}
                        alt=""
                        className="h-6 w-6 rounded-full bg-space-elevated"
                      />
                    ) : (
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-space-elevated text-2xs text-star-500">
                        {identity.displayName.slice(0, 1).toUpperCase()}
                      </span>
                    )}
                    <span className="min-w-0">
                      <span className="block truncate text-star-200">{identity.displayName}</span>
                      {identity.uniqueName && (
                        <span className="block truncate text-star-500">{identity.uniqueName}</span>
                      )}
                    </span>
                  </button>
                );
              })}
              {identitySearch.data && identitySearch.data.length === 0 && (
                <p className="p-3 text-xs text-star-500">No Azure DevOps users found.</p>
              )}
            </div>
          )}
          <Textarea
            value={azureComment}
            onChange={(e) => setAzureComment(e.currentTarget.value)}
            disabled={!canPostAzureComment}
            className="min-h-28"
            placeholder="Comment to add to Azure Boards..."
          />
          <Button
            variant="primary"
            className="w-full"
            disabled={!canPostAzureComment || !azureComment.trim() || addAzureComment.isPending}
            onClick={() =>
              addAzureComment.mutate({
                projectId,
                taskId,
                body: azureComment,
                mentions: selectedMentions,
              })
            }
          >
            {addAzureComment.isPending ? "…" : "Post Azure Comment"}
          </Button>
          {addAzureComment.error && (
            <p className="text-xs text-nebula-rose">{addAzureComment.error.message}</p>
          )}
          {addAzureComment.isSuccess && (
            <p className="text-xs text-nebula-cyan">Comment synced to Azure DevOps.</p>
          )}
        </Surface>

        <Surface className="space-y-3">
          <h2 className="text-sm font-medium text-star-100">Task State</h2>
          <Field
            label="Status"
            hint={task.azureWorkItemId ? "Status changes sync to the connected external issue when credentials are available." : undefined}
          >
            <div className="grid grid-cols-2 gap-1">
              {(["to_do", "in_progress", "reviewed", "resolved", "published", "done", "canceled"] as const).map((s) => (
                <Button
                  key={s}
                  variant={task.status === s ? "primary" : "ghost"}
                  className="w-full justify-start"
                  disabled={update.isPending}
                  onClick={() => update.mutate({ projectId, taskId, status: s as Status })}
                >
                  {STATUS_LABELS[s]}
                </Button>
              ))}
            </div>
          </Field>
        </Surface>

        <Surface className="space-y-3">
          <Field label="Attach PR URL" hint="Transitions to status=reviewed">
            <Input
              type="text"
              value={prUrl}
              onChange={(e) => setPrUrl(e.currentTarget.value)}
              placeholder="https://github.com/.../pull/123"
            />
          </Field>
          <Button
            variant="primary"
            className="w-full"
            disabled={!prUrl || update.isPending}
            onClick={() => update.mutate({ projectId, taskId, status: "reviewed", prUrl })}
          >
            Attach PR + reviewed
          </Button>
          {task.prUrl && (
            <a
              href={task.prUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-[var(--color-nebula-cyan)] hover:text-[var(--color-star-100)] break-all block"
            >
              {task.prUrl}
            </a>
          )}
        </Surface>
      </aside>
    </div>
  );
}
