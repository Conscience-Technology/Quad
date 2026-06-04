"use client";

import Link from "next/link";
import { Avatar, Breadcrumb, Kbd } from "./ui";

export function TopBar({
  breadcrumb,
  actions,
  user,
}: {
  breadcrumb: Array<{ label: string; href?: string }>;
  actions?: React.ReactNode;
  user?: { email: string; name?: string | null; isSuperAdmin: boolean };
}) {
  return (
    <header
      className="sticky top-0 z-30 flex min-h-12 items-center justify-between gap-4 border-b border-space-border bg-space-bg/90 px-4 py-2.5 backdrop-blur sm:px-6"
    >
      <Breadcrumb items={breadcrumb} />

      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={() => {
            const ev = new KeyboardEvent("keydown", { key: "k", metaKey: true });
            window.dispatchEvent(ev);
          }}
          className="hidden min-h-8 items-center gap-2 rounded-md border border-space-border bg-space-surface px-2.5 py-1 text-xs text-star-500 transition-colors hover:border-space-border-strong hover:bg-space-hover hover:text-star-100 sm:flex"
          style={{
            transitionTimingFunction: "var(--ease-cosmos)",
            transitionDuration: "160ms",
          }}
        >
          <span>Search</span>
          <span className="flex items-center gap-0.5">
            <Kbd>⌘</Kbd>
            <Kbd>K</Kbd>
          </span>
        </button>
        {actions}
        {user && (
          <Link
            href="/account/mcp-keys"
            className="ml-1 flex min-h-8 items-center gap-2 rounded-md px-1.5 py-1 transition-colors hover:bg-space-hover"
            style={{
              transitionTimingFunction: "var(--ease-cosmos)",
              transitionDuration: "160ms",
            }}
            title={user.email}
          >
            <Avatar email={user.email} name={user.name ?? undefined} size={22} />
            {user.isSuperAdmin && (
              <span className="text-2xs text-nebula-violet uppercase tracking-wider hidden md:inline">
                admin
              </span>
            )}
          </Link>
        )}
      </div>
    </header>
  );
}
