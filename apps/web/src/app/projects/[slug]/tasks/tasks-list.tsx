"use client";

import Link from "next/link";
import { useState } from "react";
import { EmptyState, Pill, ShortId, StatusDot, type TaskStatus } from "~/components/ui";
import { relativeTime } from "~/components/bug-row";
import { trpc } from "~/lib/trpc/react";

type Status = TaskStatus | "all";

const TABS: Status[] = [
  "queued",
  "picked",
  "in_progress",
  "pr_open",
  "done",
  "wont_do",
  "all",
];

export function TasksList({
  projectId,
  projectSlug,
}: {
  projectId: string;
  projectSlug: string;
}) {
  const [status, setStatus] = useState<Status>("queued");
  const q = trpc.tasks.list.useQuery({ projectId, status });
  return (
    <div className="space-y-4">
      <div className="flex gap-1 text-[13px] border-b border-space-border -mx-1 px-1">
        {TABS.map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`px-3 py-2 transition-colors border-b-2 -mb-[1px] ${
              status === s
                ? "text-star-100 border-nebula-violet"
                : "text-star-500 hover:text-star-100 border-transparent"
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
      <div className="space-y-0.5">
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
            className="group flex items-center gap-3 px-3 py-2 rounded-md border border-transparent hover:border-space-border hover:bg-space-hover transition-colors"
            style={{
              transitionTimingFunction: "var(--ease-cosmos)",
              transitionDuration: "120ms",
            }}
          >
            <StatusDot kind="task" status={t.status} />
            <ShortId id={t.id} prefix="T" />
            <span className="flex-1 min-w-0 text-[13px] text-star-100 truncate">
              {t.title}
            </span>
            {t.prUrl && <Pill tone="violet">PR</Pill>}
            <span className="text-2xs text-star-500 font-mono shrink-0">
              {relativeTime(t.updatedAt)}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
