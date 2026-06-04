"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Button,
  EmptyState,
  Kbd,
  ShortId,
  StatusDot,
  type BugStatus,
} from "~/components/ui";
import { relativeTime } from "~/components/bug-row";
import { trpc } from "~/lib/trpc/react";

const NEXT_FOR: Record<BugStatus, BugStatus[]> = {
  new: ["triaging", "wont_do"],
  triaging: ["new", "wont_do"],
  confirmed: ["resolved", "wont_do"],
  resolved: [],
  wont_do: ["new"],
};

export function BugColumnView({
  projectId,
  projectSlug,
  status,
  title,
  hint,
}: {
  projectId: string;
  projectSlug: string;
  status: BugStatus;
  title: string;
  hint?: string;
}) {
  const q = trpc.bugs.list.useQuery({ projectId, status, limit: 200 });
  const utils = trpc.useUtils();
  const transition = trpc.bugs.transition.useMutation({
    onMutate: async (vars) => {
      // Optimistic: drop the row from this column instantly.
      await utils.bugs.list.cancel({ projectId, status, limit: 200 });
      const prev = utils.bugs.list.getData({ projectId, status, limit: 200 });
      utils.bugs.list.setData({ projectId, status, limit: 200 }, (cur) =>
        (cur ?? []).filter((b) => b.id !== vars.bugId),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) utils.bugs.list.setData({ projectId, status, limit: 200 }, ctx.prev);
    },
    onSettled: () => utils.bugs.list.invalidate({ projectId }),
  });
  const [cursor, setCursor] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const list = q.data ?? [];
      if (e.key === "j") setCursor((c) => Math.min(list.length - 1, c + 1));
      else if (e.key === "k") setCursor((c) => Math.max(0, c - 1));
      else if (e.key === "Enter") {
        const item = list[cursor];
        if (item) window.location.href = `/projects/${projectSlug}/bug/${item.id}`;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [q.data, cursor, projectSlug]);

  const list = q.data ?? [];

  return (
    <div className="space-y-5 max-w-5xl">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="space-y-1 min-w-0">
          <div className="flex items-baseline gap-3">
            <h1 className="text-xl tracking-tight">{title}</h1>
            <span className="text-2xs text-star-500 font-mono">
              {q.isLoading ? "…" : list.length}
            </span>
          </div>
          {hint && <p className="text-xs text-star-500">{hint}</p>}
        </div>
        <div className="flex items-center gap-2 text-2xs text-star-500 shrink-0 pt-1">
          <Kbd>j</Kbd>
          <Kbd>k</Kbd>
          <span>Go</span>
          <Kbd>⏎</Kbd>
          <span>Open</span>
        </div>
      </header>

      {!q.isLoading && list.length === 0 && (
        <EmptyState title="Empty" />
      )}

      <div className="space-y-1">
        {list.map((b, i) => {
          const isSel = cursor === i;
          return (
            <div
              key={b.id}
              onMouseEnter={() => setCursor(i)}
              className={`group flex flex-col gap-2 rounded-md border px-3 py-3 transition-colors sm:flex-row sm:items-center sm:gap-3 ${
                isSel
                  ? "border-nebula-violet/30 bg-space-hover"
                  : "border-transparent hover:border-space-border hover:bg-space-hover"
              }`}
              style={{
                transitionTimingFunction: "var(--ease-cosmos)",
                transitionDuration: "120ms",
              }}
            >
              <Link
                href={`/projects/${projectSlug}/bug/${b.id}`}
                className="flex-1 min-w-0 flex items-center gap-3"
              >
                <StatusDot status={b.status} />
                <ShortId id={b.id} />
                <span className="flex-1 min-w-0 text-[13px] text-star-100 truncate">
                  {b.title}
                </span>
                <span className="hidden md:flex items-center gap-3 shrink-0 text-2xs text-star-500 font-mono">
                  <span className="uppercase tracking-wider text-star-700">
                    {b.kind}
                  </span>
                  {b.targetRoute && (
                    <span className="truncate max-w-[180px]">{b.targetRoute}</span>
                  )}
                  <span>{relativeTime(b.updatedAt)}</span>
                </span>
              </Link>
              <div className="flex gap-1 shrink-0 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                {NEXT_FOR[status].map((next) => (
                  <Button
                    key={next}
                    variant={next === "wont_do" ? "danger" : "subtle"}
                    size="sm"
                    onClick={() =>
                      transition.mutate({ projectId, bugId: b.id, status: next })
                    }
                    disabled={transition.isPending}
                  >
                    → {next.replace("_", " ")}
                  </Button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
