"use client";

import Link from "next/link";
import { useState } from "react";
import {
  BrandMark,
  Button,
  EmptyState,
  Field,
  Input,
  Pill,
  Surface,
} from "~/components/ui";
import { TopBar } from "~/components/topbar";
import { trpc } from "~/lib/trpc/react";

export function ProjectsPanel({
  userEmail,
  userName,
  isSuperAdmin,
}: {
  userEmail: string;
  userName?: string | null;
  isSuperAdmin: boolean;
}) {
  const list = trpc.projects.list.useQuery();
  const utils = trpc.useUtils();
  const create = trpc.projects.create.useMutation({
    onSuccess: async () => {
      await utils.projects.list.invalidate();
      setOpen(false);
      setName("");
    },
  });
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  return (
    <div className="min-h-screen flex flex-col">
      <TopBar
        breadcrumb={[{ label: "Projects" }]}
        user={{ email: userEmail, name: userName, isSuperAdmin }}
        actions={
          isSuperAdmin ? (
            <Link
              href="/admin"
              className="text-xs text-nebula-cyan hover:text-star-100 px-2.5 py-1 rounded hover:bg-space-hover transition-colors"
              style={{
                transitionTimingFunction: "var(--ease-cosmos)",
                transitionDuration: "160ms",
              }}
            >
              Admin
            </Link>
          ) : null
        }
      />

      <main className="flex-1 px-8 py-8 max-w-4xl w-full mx-auto space-y-8">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BrandMark />
            <h1 className="text-xl tracking-tight">Projects</h1>
          </div>
          {!open && (
            <Button variant="primary" onClick={() => setOpen(true)}>
              + New project
            </Button>
          )}
        </header>

        {open && (
          <Surface>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!name) return;
                create.mutate({ name });
              }}
              className="space-y-4"
            >
              <Field label="Project name">
                <Input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.currentTarget.value)}
                  placeholder="acme-web"
                  autoFocus
                />
              </Field>
              {create.error && (
                <p className="text-sm text-nebula-rose">{create.error.message}</p>
              )}
              <div className="flex gap-2">
                <Button
                  type="submit"
                  variant="primary"
                  disabled={create.isPending || !name}
                >
                  {create.isPending ? "..." : "Create"}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </Surface>
        )}

        <div className="space-y-1">
          {list.isLoading && (
            <p className="text-sm text-star-500 px-3">Loading…</p>
          )}
          {list.data?.length === 0 && !list.isLoading && (
            <EmptyState
              title="No projects yet"
              description="Create a project, drop the SDK into your host app, and reports start flowing in."
              action={
                <Button variant="primary" onClick={() => setOpen(true)}>
                  + New project
                </Button>
              }
            />
          )}
          {list.data?.map((p) => (
            <Link
              key={p.id}
              href={`/projects/${p.slug}`}
              className="group flex items-center gap-4 px-3 py-2.5 rounded-md border border-transparent hover:border-space-border hover:bg-space-hover transition-colors"
              style={{
                transitionTimingFunction: "var(--ease-cosmos)",
                transitionDuration: "140ms",
              }}
            >
              <div className="flex-1 min-w-0 flex items-center gap-3">
                <p className="text-[13px] text-star-100 truncate">{p.name}</p>
                <p className="text-2xs text-star-500 font-mono truncate">{p.slug}</p>
              </div>
              <div className="hidden md:flex items-center gap-4 text-2xs text-star-500 font-mono shrink-0">
                <span>{p.memberCount} members</span>
                <span className="flex items-center gap-1">
                  {p.openBugCount > 0 && (
                    <span className="w-1.5 h-1.5 rounded-full bg-nebula-amber animate-pulse" />
                  )}
                  {p.openBugCount} open / {p.bugCount} total
                </span>
              </div>
              <Pill tone={p.role === "owner" ? "violet" : "neutral"}>{String(p.role)}</Pill>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
