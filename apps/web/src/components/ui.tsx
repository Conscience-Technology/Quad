"use client";

import Link from "next/link";
import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
} from "react";

const EASE = {
  transitionTimingFunction: "var(--ease-cosmos)",
  transitionDuration: "160ms",
};

// ---- Button --------------------------------------------------------------

export function Button({
  variant = "ghost",
  size = "md",
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger" | "subtle";
  size?: "sm" | "md";
}) {
  const base =
    "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition disabled:opacity-40 disabled:cursor-not-allowed select-none";
  const sizes: Record<typeof size, string> = {
    sm: "px-2.5 py-1 text-xs",
    md: "px-3 py-1.5 text-[13px]",
  };
  const styles: Record<typeof variant, string> = {
    primary:
      "bg-nebula-violet text-space-void hover:opacity-90 shadow-[0_0_0_1px_var(--color-nebula-violet)]",
    ghost:
      "text-star-300 hover:text-star-100 hover:bg-space-hover",
    subtle:
      "text-star-500 hover:text-star-100 hover:bg-space-hover",
    danger:
      "text-nebula-rose hover:bg-nebula-rose/10",
  };
  return (
    <button
      {...rest}
      style={{ ...EASE, ...(rest.style ?? {}) }}
      className={`${base} ${sizes[size]} ${styles[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

// ---- Input ---------------------------------------------------------------

export function Input({
  className = "",
  ...rest
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...rest}
      className={`w-full bg-transparent border-0 border-b border-space-border text-star-100 text-sm py-2 outline-none focus:border-nebula-violet focus:shadow-none transition-colors placeholder:text-star-700 ${className}`}
      style={{ ...EASE, boxShadow: "none", ...(rest.style ?? {}) }}
    />
  );
}

export function Textarea({
  className = "",
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...rest}
      className={`w-full min-h-24 resize-y bg-space-void border border-space-border rounded-md text-star-100 text-sm p-3 outline-none focus:border-nebula-violet transition-colors placeholder:text-star-700 ${className}`}
      style={{ ...EASE, boxShadow: "none", ...(rest.style ?? {}) }}
    />
  );
}

// ---- Field ---------------------------------------------------------------

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-2xs text-star-500 tracking-wider uppercase font-medium">
        {label}
      </span>
      {children}
      {hint && (
        <span className="block text-2xs text-star-500 pt-0.5">{hint}</span>
      )}
    </label>
  );
}

// ---- Surface (card) -------------------------------------------------------

export function Surface({
  className = "",
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...rest}
      className={`bg-space-surface rounded-lg border border-space-border p-5 ${className}`}
    >
      {children}
    </div>
  );
}

// ---- Code / inline mono ---------------------------------------------------

export function Code({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <code
      className={`font-mono text-xs bg-space-void text-star-300 px-1.5 py-0.5 rounded border border-space-border ${className}`}
    >
      {children}
    </code>
  );
}

// ---- Kbd ------------------------------------------------------------------

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-mono bg-space-elevated border border-space-border-strong rounded text-star-500">
      {children}
    </kbd>
  );
}

// ---- Status dot -----------------------------------------------------------

export type BugStatus = "new" | "triaging" | "confirmed" | "resolved" | "wont_do";
export type TaskStatus =
  | "to_do"
  | "in_progress"
  | "reviewed"
  | "resolved"
  | "published"
  | "done"
  | "canceled";

const BUG_DOT: Record<BugStatus, { color: string; label: string }> = {
  new: { color: "var(--color-nebula-cyan)", label: "New" },
  triaging: { color: "var(--color-nebula-amber)", label: "Triage" },
  confirmed: { color: "var(--color-nebula-violet)", label: "Confirmed" },
  resolved: { color: "var(--color-nebula-green)", label: "Resolved" },
  wont_do: { color: "var(--color-star-500)", label: "Won't do" },
};
const TASK_DOT: Record<TaskStatus, { color: string; label: string }> = {
  to_do: { color: "var(--color-nebula-cyan)", label: "To Do" },
  in_progress: { color: "var(--color-nebula-amber)", label: "In Progress" },
  reviewed: { color: "var(--color-nebula-violet)", label: "Reviewed" },
  resolved: { color: "var(--color-nebula-green)", label: "Resolved" },
  published: { color: "var(--color-nebula-violet)", label: "Published" },
  done: { color: "var(--color-nebula-green)", label: "Done" },
  canceled: { color: "var(--color-star-500)", label: "Canceled" },
};

export function StatusDot({
  kind = "bug",
  status,
  withLabel = false,
  className = "",
}: {
  kind?: "bug" | "task";
  status: string;
  withLabel?: boolean;
  className?: string;
}) {
  const map = kind === "task" ? TASK_DOT : BUG_DOT;
  const info = (map as Record<string, { color: string; label: string }>)[status] ?? {
    color: "var(--color-star-500)",
    label: status,
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-2xs uppercase tracking-wider text-star-500 ${className}`}
    >
      <span
        className="inline-block w-1.5 h-1.5 rounded-full"
        style={{ background: info.color, boxShadow: `0 0 6px ${info.color}55` }}
      />
      {withLabel && info.label}
    </span>
  );
}

// ---- Avatar (email initial) ----------------------------------------------

export function Avatar({
  email,
  name,
  size = 24,
}: {
  email: string;
  name?: string | null;
  size?: number;
}) {
  const seed = (name ?? email).trim();
  const initial = seed.charAt(0).toUpperCase();
  const hue = Math.abs(hash(seed)) % 360;
  return (
    <span
      className="inline-flex items-center justify-center rounded-full font-medium text-space-void shrink-0"
      style={{
        width: size,
        height: size,
        background: `hsl(${hue}, 60%, 70%)`,
        fontSize: size <= 20 ? 10 : 11,
      }}
      title={email}
    >
      {initial}
    </span>
  );
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

// ---- Empty state ----------------------------------------------------------

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
      <BrandMark size={28} className="text-star-700" />
      <div className="space-y-1">
        <p className="text-sm text-star-300">{title}</p>
        {description && (
          <p className="text-xs text-star-500 max-w-sm">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

// ---- Breadcrumb -----------------------------------------------------------

export function Breadcrumb({
  items,
}: {
  items: Array<{ label: string; href?: string }>;
}) {
  return (
    <nav className="flex items-center gap-1.5 text-xs text-star-500 min-w-0">
      {items.map((it, i) => (
        <span key={i} className="flex items-center gap-1.5 min-w-0">
          {it.href ? (
            <Link
              href={it.href}
              className="hover:text-star-100 transition-colors truncate"
              style={EASE}
            >
              {it.label}
            </Link>
          ) : (
            <span className="text-star-300 truncate">{it.label}</span>
          )}
          {i < items.length - 1 && <span className="text-star-700">/</span>}
        </span>
      ))}
    </nav>
  );
}

// ---- Pill -----------------------------------------------------------------

export function Pill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "violet" | "cyan" | "amber" | "rose" | "green";
}) {
  const tones: Record<typeof tone, string> = {
    neutral: "bg-space-elevated text-star-300 border-space-border",
    violet: "bg-nebula-violet/10 text-nebula-violet border-nebula-violet/20",
    cyan: "bg-nebula-cyan/10 text-nebula-cyan border-nebula-cyan/20",
    amber: "bg-nebula-amber/10 text-nebula-amber border-nebula-amber/20",
    rose: "bg-nebula-rose/10 text-nebula-rose border-nebula-rose/20",
    green: "bg-nebula-green/10 text-nebula-green border-nebula-green/20",
  };
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 text-2xs font-mono uppercase tracking-wider rounded border ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

// ---- Copy button ----------------------------------------------------------

export function CopyButton({
  text,
  label = "Copy",
}: {
  text: string;
  label?: string;
}) {
  return (
    <Button
      type="button"
      variant="subtle"
      size="sm"
      onClick={() => {
        if (typeof navigator !== "undefined" && navigator.clipboard) {
          void navigator.clipboard.writeText(text);
        }
      }}
    >
      {label}
    </Button>
  );
}

// ---- Brand mark -----------------------------------------------------------
/**
 * Quad logo. A 2×2 grid (the "quad") with one cell filled in violet — the
 * one Reporter just pinned. Symbolic of the 4-column board (Inbox/Triage/
 * Confirmed/Resolved) and of "the one cell that needs attention". The
 * outline cells use currentColor so the mark inherits text color around it;
 * the highlighted cell is always violet.
 */
export function BrandMark({
  size = 16,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <rect x="1.4" y="1.4" width="5.6" height="5.6" rx="1.2" stroke="currentColor" strokeWidth="1.2" opacity="0.55" />
      <rect x="9" y="1.4" width="5.6" height="5.6" rx="1.2" fill="var(--color-nebula-violet)" />
      <rect x="1.4" y="9" width="5.6" height="5.6" rx="1.2" stroke="currentColor" strokeWidth="1.2" opacity="0.55" />
      <rect x="9" y="9" width="5.6" height="5.6" rx="1.2" stroke="currentColor" strokeWidth="1.2" opacity="0.55" />
    </svg>
  );
}

/** BrandMark + "Quad" wordmark in Pretendard. */
export function BrandWordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <BrandMark size={16} className="text-star-300" />
      <span className="text-[15px] font-semibold tracking-tight text-star-100">Quad</span>
    </span>
  );
}

// ---- Short ID -------------------------------------------------------------

export function ShortId({
  id,
  prefix = "Q",
}: {
  id: string;
  prefix?: string;
}) {
  return (
    <span className="font-mono text-2xs text-star-500 uppercase">
      {prefix}-{id.replace(/-/g, "").slice(0, 6).toUpperCase()}
    </span>
  );
}

// ---- Section header -------------------------------------------------------

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-2xs uppercase tracking-wider text-star-500 font-medium">
      {children}
    </h2>
  );
}
