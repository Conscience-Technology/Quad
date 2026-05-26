"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Kbd } from "./ui";
import { trpc } from "~/lib/trpc/react";

type Item = {
  id: string;
  label: string;
  hint?: string;
  href: string;
  group: "Project" | "Page" | "Admin";
};

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);

  const projects = trpc.projects.list.useQuery(undefined, {
    enabled: open,
  });

  const items = useMemo<Item[]>(() => {
    const base: Item[] = [
      { id: "p:projects", label: "Projects", href: "/projects", group: "Page" },
      { id: "p:keys", label: "MCP keys", href: "/account/mcp-keys", group: "Page" },
      { id: "p:admin", label: "Admin", href: "/admin", group: "Admin" },
      { id: "p:admin-users", label: "Admin · Users", href: "/admin/users", group: "Admin" },
      { id: "p:admin-projects", label: "Admin · Projects", href: "/admin/projects", group: "Admin" },
      { id: "p:admin-settings", label: "Admin · Settings", href: "/admin/settings", group: "Admin" },
      { id: "p:admin-audit", label: "Admin · Audit", href: "/admin/audit", group: "Admin" },
    ];
    const projItems: Item[] = (projects.data ?? []).flatMap((p) => [
      {
        id: `proj:${p.id}`,
        label: p.name,
        hint: p.slug,
        href: `/projects/${p.slug}`,
        group: "Project" as const,
      },
      {
        id: `proj:${p.id}:tasks`,
        label: `${p.name} → Tasks`,
        hint: p.slug,
        href: `/projects/${p.slug}/tasks`,
        group: "Project" as const,
      },
      {
        id: `proj:${p.id}:members`,
        label: `${p.name} → Members`,
        hint: p.slug,
        href: `/projects/${p.slug}/members`,
        group: "Project" as const,
      },
    ]);
    return [...projItems, ...base];
  }, [projects.data]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((it) =>
      [it.label, it.hint].filter(Boolean).join(" ").toLowerCase().includes(needle),
    );
  }, [items, q]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((o) => !o);
        setQ("");
        setCursor(0);
      } else if (open && e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    setCursor(0);
  }, [q]);

  if (!open) return null;

  const go = (it: Item) => {
    setOpen(false);
    router.push(it.href);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[18vh] px-4"
      onClick={() => setOpen(false)}
    >
      <div
        className="absolute inset-0 bg-space-void/70 backdrop-blur-sm"
        style={{ transitionTimingFunction: "var(--ease-cosmos)" }}
      />
      <div
        className="relative w-full max-w-xl bg-space-elevated rounded-xl border border-space-border-strong shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-space-border px-4 py-3">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search or jump to…"
            className="w-full bg-transparent outline-none text-star-100 placeholder:text-star-700 text-sm"
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setCursor((c) => Math.min(filtered.length - 1, c + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setCursor((c) => Math.max(0, c - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                const it = filtered[cursor];
                if (it) go(it);
              }
            }}
          />
        </div>
        <div className="max-h-[60vh] overflow-y-auto py-1">
          {filtered.length === 0 && (
            <p className="text-sm text-star-500 px-4 py-6 text-center">
              No matches
            </p>
          )}
          {filtered.map((it, i) => (
            <button
              key={it.id}
              onMouseEnter={() => setCursor(i)}
              onClick={() => go(it)}
              className={`w-full flex items-center justify-between gap-3 px-4 py-2 text-left text-sm ${
                cursor === i
                  ? "bg-nebula-violet/10 text-star-100"
                  : "text-star-300 hover:bg-space-hover"
              }`}
            >
              <span className="flex items-center gap-3 min-w-0">
                <span className="text-2xs uppercase tracking-wider text-star-700 w-14 shrink-0">
                  {it.group}
                </span>
                <span className="truncate">{it.label}</span>
              </span>
              {it.hint && (
                <span className="text-2xs font-mono text-star-700 shrink-0">{it.hint}</span>
              )}
            </button>
          ))}
        </div>
        <div className="border-t border-space-border px-4 py-2 flex items-center justify-between text-2xs text-star-700">
          <span className="flex items-center gap-1.5">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd>
            <span>navigate</span>
            <Kbd>⏎</Kbd>
            <span>go</span>
            <Kbd>esc</Kbd>
            <span>close</span>
          </span>
          <span>Command Palette</span>
        </div>
      </div>
    </div>
  );
}
