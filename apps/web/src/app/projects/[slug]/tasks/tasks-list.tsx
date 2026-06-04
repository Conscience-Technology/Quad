"use client";

import Link from "next/link";
import { useState } from "react";
import { EmptyState, Pill, ShortId, StatusDot, type TaskStatus } from "~/components/ui";
import { relativeTime } from "~/components/bug-row";
import { trpc } from "~/lib/trpc/react";

type Status = TaskStatus | "all";

const TABS: Status[] = [
  "to_do",
  "in_progress",
  "reviewed",
  "resolved",
  "published",
  "done",
  "canceled",
  "all",
];

export function TasksList({
  projectId,
  projectSlug,
}: {
  projectId: string;
  projectSlug: string;
}) {
  const [status, setStatus] = useState<Status>("to_do");
  const q = trpc.tasks.list.useQuery({ projectId, status });
  return (
    <div className="space-y-5 max-w-5xl">
      <header className="space-y-1">
        <h1 className="text-xl tracking-tight">Tasks</h1>
        <p className="text-xs text-star-500">
          Work items generated from confirmed bug reports, ready for MCP or manual follow-up.
        </p>
      </header>
      <div className="flex flex-wrap gap-1 rounded-lg border border-space-border bg-space-bg p-1 text-[13px]">
        {TABS.map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`rounded-md px-3 py-1.5 transition-colors ${
              status === s
                ? "bg-space-elevated text-star-100 shadow-[0_0_0_1px_var(--color-space-border)]"
                : "text-star-500 hover:bg-space-hover hover:text-star-100"
            }`}
            style={{
              transitionTimingFunction: "var(--ease-cosmos)",
              transitionDuration: "140ms",
            }}
          >
            {s.replace("_", " ")}
          </button>
        ))}
      </div>
      <div className="space-y-1">
        {q.isLoading && (
          <p className="text-sm text-star-500 px-2 py-3">Loading…</p>
        )}
        {q.data?.length === 0 && !q.isLoading && (
          <EmptyState
            title="No tasks in this state"
            description="Press Confirm on a bug detail to generate a Task."
          />
        )}
        {q.data?.map((t) => (
          <Link
            key={t.id}
            href={`/projects/${projectSlug}/task/${t.id}`}
            className="group flex flex-col gap-2 rounded-md border border-transparent px-3 py-3 transition-colors hover:border-space-border hover:bg-space-hover sm:flex-row sm:items-center sm:gap-3"
            style={{
              transitionTimingFunction: "var(--ease-cosmos)",
              transitionDuration: "120ms",
            }}
          >
            <div className="flex flex-1 min-w-0 items-center gap-3">
              <StatusDot kind="task" status={t.status} />
              <ShortId id={t.id} prefix="T" />
              <span className="flex-1 min-w-0 text-[13px] text-star-100 truncate">
                {t.title}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 pl-8 sm:pl-0">
              {t.azureWorkItemId && <Pill tone="cyan">ADO #{t.azureWorkItemId}</Pill>}
              {t.prUrl && <Pill tone="violet">PR</Pill>}
              <span className="text-2xs text-star-500 font-mono shrink-0">
                {relativeTime(t.updatedAt)}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
