"use client";

import { useState } from "react";
import { Button, Code, Field, Input, Surface } from "~/components/ui";
import { trpc } from "~/lib/trpc/react";

type Status = "queued" | "picked" | "in_progress" | "pr_open" | "done" | "wont_do";

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
  const [prUrl, setPrUrl] = useState("");
  const [externalIssueId, setExternalIssueId] = useState("");

  if (q.isLoading) return <p className="text-sm text-[var(--color-star-500)]">…</p>;
  if (!q.data) return null;
  const { task, briefUrl, markdown, events } = q.data;

  return (
    <div className="grid grid-cols-[1fr_320px] gap-8 max-w-6xl">
      <div className="space-y-6 min-w-0">
        <header className="space-y-2">
          <p className="text-xs text-[var(--color-star-500)] uppercase tracking-wide">
            task · {task.status}
          </p>
          <h1 className="text-2xl tracking-tight">{task.title}</h1>
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

      <aside className="space-y-4">
        <Surface className="space-y-3">
          <Field
            label="External Issue"
            hint="Azure DevOps is the active provider. Enter an Azure Boards work item number, for example 8743."
          >
            <Input
              type="number"
              min="1"
              value={externalIssueId}
              onChange={(e) => setExternalIssueId(e.currentTarget.value)}
              placeholder={task.azureWorkItemId ? String(task.azureWorkItemId) : "8743"}
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
            {linkExternalIssue.isPending ? "…" : "Link Issue"}
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
          {task.azureWorkItemUrl && (
            <div className="space-y-1">
              <p className="text-2xs uppercase tracking-wider text-[var(--color-star-500)]">
                Connected issue
              </p>
              <a
                href={task.azureWorkItemUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-[var(--color-nebula-cyan)] hover:text-[var(--color-star-100)] break-all block"
              >
                Azure DevOps #{task.azureWorkItemId}
              </a>
            </div>
          )}
        </Surface>

        <Surface className="space-y-3">
          <Field
            label="Status"
            hint={task.azureWorkItemId ? "Status changes sync to the connected external issue when credentials are available." : undefined}
          >
            <div className="space-y-1">
              {(["queued", "picked", "in_progress", "pr_open", "done", "wont_do"] as const).map((s) => (
                <Button
                  key={s}
                  variant={task.status === s ? "primary" : "ghost"}
                  className="w-full justify-start"
                  disabled={update.isPending}
                  onClick={() => update.mutate({ projectId, taskId, status: s as Status })}
                >
                  → {s}
                </Button>
              ))}
            </div>
          </Field>
        </Surface>

        <Surface className="space-y-3">
          <Field label="Attach PR URL" hint="Transitions to status=pr_open">
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
            onClick={() => update.mutate({ projectId, taskId, status: "pr_open", prUrl })}
          >
            Attach PR + pr_open
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
