"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  CircleCheckBig,
  CircleDot,
  Inbox,
  Key,
  Layers,
  ListChecks,
  Search,
  Settings,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Kbd } from "~/components/ui";
import { trpc } from "~/lib/trpc/react";

const PRIMARY: Array<{ href: string; label: string; icon: LucideIcon }> = [
  { href: "", label: "Board", icon: Layers },
  { href: "/triage", label: "Triage", icon: CircleDot },
  { href: "/tasks", label: "Tasks", icon: ListChecks },
  { href: "/resolved", label: "Resolved", icon: CircleCheckBig },
];

const SETTINGS: Array<{ href: string; label: string; icon: LucideIcon }> = [
  { href: "/settings", label: "General", icon: Settings },
  { href: "/members", label: "Members", icon: Users },
  { href: "/settings/api-keys", label: "API keys", icon: Key },
  { href: "/settings/privacy", label: "Privacy", icon: ShieldCheck },
];

export function ProjectNav({
  slug,
  projectName,
  projectId,
}: {
  slug: string;
  projectName: string;
  projectId: string;
}) {
  const path = usePathname();
  const base = `/projects/${slug}`;
  const isActive = (href: string) => {
    const full = `${base}${href}`;
    if (href === "") return path === full;
    if (href === "/settings") return path === full;
    return path === full || path.startsWith(`${full}/`);
  };

  const proj = trpc.projects.list.useQuery();
  const me = proj.data?.find((p) => p.id === projectId);
  const triage = trpc.bugs.list.useQuery({ projectId, status: "triaging", limit: 200 });
  const resolved = trpc.bugs.list.useQuery({ projectId, status: "resolved", limit: 200 });
  const tasksQueued = trpc.tasks.list.useQuery({ projectId, status: "queued" });
  const members = trpc.members.list.useQuery({ projectId });

  const countFor = (label: string): number | undefined => {
    if (label === "Board") return me?.openBugCount;
    if (label === "Triage") return triage.data?.length;
    if (label === "Tasks") return tasksQueued.data?.length;
    if (label === "Resolved") return resolved.data?.length;
    if (label === "Members") return members.data?.length;
    return undefined;
  };

  return (
    <>
      <ProjectSwitcher projectId={projectId} currentName={projectName} />

      <div className="px-2 pb-1">
        <SearchRow />
      </div>

      <p className="px-4 pt-3 pb-1 text-2xs uppercase tracking-wider text-star-700 font-medium">
        Project
      </p>

      <nav className="flex-1 px-2 pb-3 overflow-y-auto">
        <div className="space-y-px">
          {PRIMARY.map((n) => (
            <NavItem
              key={n.href}
              href={`${base}${n.href}`}
              label={n.label}
              Icon={n.icon}
              active={isActive(n.href)}
              count={countFor(n.label)}
            />
          ))}
        </div>

        <Divider />

        <NavItem
          href="/account/mcp-keys"
          label="MCP keys"
          Icon={Key}
          active={path === "/account/mcp-keys"}
        />

        <p className="px-2.5 pt-3 pb-1 text-2xs uppercase tracking-wider text-star-700 font-medium">
          Settings
        </p>
        <div className="space-y-px">
          {SETTINGS.map((n) => (
            <NavItem
              key={n.href}
              href={`${base}${n.href}`}
              label={n.label}
              Icon={n.icon}
              active={isActive(n.href)}
            />
          ))}
        </div>
      </nav>
    </>
  );
}

function ProjectSwitcher({
  projectId,
  currentName,
}: {
  projectId: string;
  currentName: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const list = trpc.projects.list.useQuery(undefined, { enabled: open });
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative px-3 pt-3 pb-2" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md border border-space-border hover:border-space-border-strong hover:bg-space-hover transition-colors"
        style={{
          transitionTimingFunction: "var(--ease-cosmos)",
          transitionDuration: "140ms",
        }}
      >
        <span className="text-[13px] font-semibold text-star-100 truncate">{currentName}</span>
        <ChevronDown size={14} className="text-star-500 shrink-0" />
      </button>
      {open && (
        <div className="absolute left-3 right-3 mt-1 bg-space-elevated border border-space-border-strong rounded-md shadow-xl py-1 z-30 max-h-72 overflow-y-auto">
          <p className="px-3 pt-1 pb-1 text-2xs uppercase tracking-wider text-star-700">
            Switch project
          </p>
          {(list.data ?? []).map((p) => (
            <button
              key={p.id}
              onClick={() => {
                setOpen(false);
                router.push(`/projects/${p.slug}`);
              }}
              className={`w-full flex items-center justify-between gap-3 px-3 py-1.5 text-left text-[13px] hover:bg-space-hover transition-colors ${
                p.id === projectId ? "text-star-100" : "text-star-300"
              }`}
            >
              <span className="truncate">{p.name}</span>
              <span className="text-2xs text-star-700 font-mono shrink-0 inline-flex items-center gap-1">
                {p.openBugCount > 0 && (
                  <span className="w-1.5 h-1.5 rounded-full bg-nebula-amber" />
                )}
                {p.bugCount}
              </span>
            </button>
          ))}
          <div className="border-t border-space-border mt-1 pt-1">
            <Link
              href="/projects"
              className="block px-3 py-1.5 text-[13px] text-star-300 hover:text-star-100 hover:bg-space-hover"
              onClick={() => setOpen(false)}
            >
              ← All projects
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function SearchRow() {
  return (
    <button
      type="button"
      onClick={() => {
        const ev = new KeyboardEvent("keydown", { key: "k", metaKey: true });
        window.dispatchEvent(ev);
      }}
      className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md text-[13px] text-star-500 hover:text-star-100 hover:bg-space-hover transition-colors"
      style={{
        transitionTimingFunction: "var(--ease-cosmos)",
        transitionDuration: "140ms",
      }}
    >
      <span className="flex items-center gap-3">
        <Search size={14} className="shrink-0" />
        Search
      </span>
      <span className="flex items-center gap-0.5">
        <Kbd>⌘</Kbd>
        <Kbd>K</Kbd>
      </span>
    </button>
  );
}

function NavItem({
  href,
  label,
  Icon,
  active,
  count,
}: {
  href: string;
  label: string;
  Icon: LucideIcon;
  active: boolean;
  count?: number;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center justify-between gap-3 px-2.5 py-1.5 rounded-md text-[13px] transition-colors ${
        active
          ? "bg-nebula-violet/12 text-star-100"
          : "text-star-300 hover:text-star-100 hover:bg-space-hover"
      }`}
      style={{
        transitionTimingFunction: "var(--ease-cosmos)",
        transitionDuration: "140ms",
      }}
    >
      <span className="flex items-center gap-3 min-w-0">
        <Icon
          size={14}
          strokeWidth={1.75}
          className={`shrink-0 ${active ? "text-nebula-violet" : "text-star-500"}`}
        />
        <span className="truncate">{label}</span>
      </span>
      {count !== undefined && count > 0 && (
        <span className="text-2xs text-star-500 font-mono shrink-0">{count}</span>
      )}
    </Link>
  );
}

function Divider() {
  return <div className="my-3 mx-2 h-px bg-space-border" />;
}
