"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FolderKanban,
  LayoutDashboard,
  ScrollText,
  Search,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";
import { LogoutButton } from "~/components/logout-button";
import { Kbd } from "~/components/ui";

const NAV: Array<{ href: string; label: string; icon: LucideIcon }> = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/projects", label: "Projects", icon: FolderKanban },
  { href: "/admin/settings", label: "Settings", icon: Settings },
  { href: "/admin/audit", label: "Audit log", icon: ScrollText },
];

export function AdminNav() {
  const path = usePathname();
  return (
    <>
      <div className="px-2 pb-1">
        <button
          type="button"
          onClick={() => {
            const ev = new KeyboardEvent("keydown", { key: "k", metaKey: true });
            window.dispatchEvent(ev);
          }}
          className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md text-[13px] text-star-500 hover:text-star-100 hover:bg-space-hover transition-colors"
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
      </div>

      <p className="px-4 pt-3 pb-1 text-2xs uppercase tracking-wider text-star-700 font-medium">
        Instance
      </p>
      <nav className="flex-1 px-2 pb-3 space-y-px overflow-y-auto">
        {NAV.map((n) => {
          const active = path === n.href;
          return (
            <Link
              key={n.href}
              href={n.href}
              className={`flex items-center gap-3 px-2.5 py-1.5 rounded-md text-[13px] transition-colors ${
                active
                  ? "bg-nebula-violet/12 text-star-100"
                  : "text-star-300 hover:text-star-100 hover:bg-space-hover"
              }`}
              style={{
                transitionTimingFunction: "var(--ease-cosmos)",
                transitionDuration: "140ms",
              }}
            >
              <n.icon
                size={14}
                strokeWidth={1.75}
                className={`shrink-0 ${active ? "text-nebula-violet" : "text-star-500"}`}
              />
              <span className="truncate">{n.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="px-4 py-3 border-t border-space-border flex items-center justify-between">
        <Link
          href="/projects"
          className="text-2xs text-star-500 hover:text-star-100 transition-colors uppercase tracking-wider"
        >
          ← Projects
        </Link>
        <LogoutButton />
      </div>
    </>
  );
}
