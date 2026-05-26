"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { EmptyState, Kbd, ShortId, StatusDot, type BugStatus } from "~/components/ui";
import { relativeTime } from "~/components/bug-row";
import { trpc } from "~/lib/trpc/react";

const COLUMNS: Array<{ key: BugStatus; label: string }> = [
  { key: "new", label: "Inbox" },
  { key: "triaging", label: "Triage" },
  { key: "confirmed", label: "Confirmed" },
  { key: "resolved", label: "Resolved" },
];

export function BoardPanel({
  projectId,
  projectSlug,
}: {
  projectId: string;
  projectSlug: string;
}) {
  const queries = COLUMNS.map((c) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    trpc.bugs.list.useQuery({ projectId, status: c.key, limit: 60 }),
  );

  const cells = useMemo(() => COLUMNS.map((_, i) => queries[i]?.data ?? []), [queries]);
  const [sel, setSel] = useState<{ col: number; idx: number }>({ col: 0, idx: 0 });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const list = cells[sel.col] ?? [];
      if (e.key === "j") setSel({ col: sel.col, idx: Math.min(list.length - 1, sel.idx + 1) });
      else if (e.key === "k") setSel({ col: sel.col, idx: Math.max(0, sel.idx - 1) });
      else if (e.key === "h") setSel({ col: Math.max(0, sel.col - 1), idx: 0 });
      else if (e.key === "l") setSel({ col: Math.min(COLUMNS.length - 1, sel.col + 1), idx: 0 });
      else if (["1", "2", "3", "4"].includes(e.key)) {
        setSel({ col: Number(e.key) - 1, idx: 0 });
      } else if (e.key === "Enter") {
        const item = (cells[sel.col] ?? [])[sel.idx];
        if (item) window.location.href = `/projects/${projectSlug}/bug/${item.id}`;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cells, sel, projectSlug]);

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl tracking-tight">Board</h1>
        <div className="flex items-center gap-2 text-2xs text-star-500">
          <Kbd>h</Kbd>
          <Kbd>j</Kbd>
          <Kbd>k</Kbd>
          <Kbd>l</Kbd>
          <span>Go</span>
          <Kbd>⏎</Kbd>
          <span>Open</span>
        </div>
      </header>

      <div className="grid grid-cols-4 gap-3">
        {COLUMNS.map((col, i) => {
          const data = cells[i] ?? [];
          const isCol = sel.col === i;
          return (
            <section
              key={col.key}
              className={`min-w-0 bg-space-bg rounded-lg border flex flex-col transition-colors ${
                isCol ? "border-space-border-strong" : "border-space-border"
              }`}
            >
              <header className="flex items-center justify-between px-3 py-2.5 border-b border-space-border">
                <div className="flex items-center gap-2">
                  <StatusDot status={col.key} />
                  <span className="text-[13px] text-star-100">{col.label}</span>
                </div>
                <span className="text-2xs text-star-500 font-mono">{data.length}</span>
              </header>
              <div className="flex-1 p-1.5 space-y-0.5 min-h-[200px]">
                {queries[i]?.isLoading && (
                  <p className="text-2xs text-star-700 px-2 py-2">Loading…</p>
                )}
                {!queries[i]?.isLoading && data.length === 0 && (
                  <p className="text-2xs text-star-700 px-2 py-2">Empty</p>
                )}
                {data.map((b, idx) => {
                  const isSel = isCol && sel.idx === idx;
                  return (
                    <Link
                      key={b.id}
                      href={`/projects/${projectSlug}/bug/${b.id}`}
                      onMouseEnter={() => setSel({ col: i, idx })}
                      className={`block px-2 py-1.5 rounded-md border transition-colors ${
                        isSel
                          ? "border-nebula-violet/30 bg-space-hover"
                          : "border-transparent hover:border-space-border hover:bg-space-hover"
                      }`}
                      style={{
                        transitionTimingFunction: "var(--ease-cosmos)",
                        transitionDuration: "120ms",
                      }}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <ShortId id={b.id} />
                        <span className="text-2xs font-mono text-star-700 uppercase">{b.kind}</span>
                      </div>
                      <p className="text-[13px] text-star-100 line-clamp-2 leading-snug">
                        {b.title}
                      </p>
                      <div className="flex items-center justify-between mt-1.5 text-2xs text-star-700 font-mono">
                        <span className="truncate">{b.targetRoute ?? "/"}</span>
                        <span className="shrink-0 ml-2">{relativeTime(b.updatedAt)}</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {cells.every((c) => c.length === 0) && !queries[0]?.isLoading && (
        <EmptyState
          title="No bug reports yet"
          description="Drop the SDK into your host app to start receiving reports. Cmd+Shift+B toggles Bug Mode; Option+Click pins an element."
        />
      )}
    </div>
  );
}
