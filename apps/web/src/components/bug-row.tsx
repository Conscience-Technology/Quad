"use client";

import Link from "next/link";
import { ShortId, StatusDot, type BugStatus } from "./ui";

export function BugRow({
  id,
  title,
  status,
  kind,
  route,
  updatedAt,
  href,
  selected,
  onMouseEnter,
  rightSlot,
}: {
  id: string;
  title: string;
  status: BugStatus;
  kind: string;
  route?: string | null;
  updatedAt?: Date | null;
  href: string;
  selected?: boolean;
  onMouseEnter?: () => void;
  rightSlot?: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onMouseEnter={onMouseEnter}
      className={`group flex items-center gap-3 px-3 py-2 rounded-md border transition-colors ${
        selected
          ? "border-nebula-violet/30 bg-space-hover"
          : "border-transparent hover:border-space-border hover:bg-space-hover"
      }`}
      style={{
        transitionTimingFunction: "var(--ease-cosmos)",
        transitionDuration: "120ms",
      }}
    >
      <StatusDot status={status} />
      <ShortId id={id} prefix="Q" />
      <span className="flex-1 min-w-0 text-[13px] text-star-100 truncate">{title}</span>
      <span className="hidden md:flex items-center gap-3 shrink-0 text-2xs text-star-500 font-mono">
        {kind && <span className="uppercase tracking-wider text-star-700">{kind}</span>}
        {route && <span className="truncate max-w-[160px]">{route}</span>}
        {updatedAt && <span>{relativeTime(updatedAt)}</span>}
      </span>
      {rightSlot && (
        <span className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          {rightSlot}
        </span>
      )}
    </Link>
  );
}

export function relativeTime(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  const diff = Date.now() - date.getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d`;
  return date.toISOString().slice(5, 10);
}
