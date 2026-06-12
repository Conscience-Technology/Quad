"use client";

import { useState } from "react";
import { Button, Code, Field, Input, Surface } from "~/components/ui";
import { trpc } from "~/lib/trpc/react";
import type { ProjectRepo } from "~/db/schema";

export function SettingsGeneralPanel({
  projectId,
  initialName,
  initialOrigins,
  initialRepo,
}: {
  projectId: string;
  initialName: string;
  initialOrigins: string[];
  initialRepo: ProjectRepo | null;
}) {
  const utils = trpc.useUtils();
  const update = trpc.projects.update.useMutation({
    onSuccess: () => utils.projects.list.invalidate(),
  });
  const del = trpc.projects.delete.useMutation();

  const [name, setName] = useState(initialName);
  const [originsText, setOriginsText] = useState(initialOrigins.join("\n"));
  const [repoProvider, setRepoProvider] = useState<ProjectRepo["provider"]>(
    initialRepo?.provider ?? "github",
  );
  const [repoOwner, setRepoOwner] = useState(initialRepo?.owner ?? "");
  const [repoName, setRepoName] = useState(initialRepo?.name ?? "");
  const [repoBranch, setRepoBranch] = useState(initialRepo?.defaultBranch ?? "main");
  const [repoPrefix, setRepoPrefix] = useState(initialRepo?.pathPrefix ?? "");
  const [confirmDelete, setConfirmDelete] = useState("");

  const parsedOrigins = originsText
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <div className="space-y-8">
      {/* General */}
      <section>
        <h2 className="text-xs uppercase tracking-wide text-[var(--color-star-500)] mb-3">
          General
        </h2>
        <Surface>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              update.mutate({
                projectId,
                name,
                allowedOrigins: parsedOrigins,
              });
            }}
          >
            <Field label="Project Name">
              <Input
                type="text"
                value={name}
                onChange={(e) => setName(e.currentTarget.value)}
              />
            </Field>
            <Field
              label="Allowed origins"
              hint="Domains the SDK is allowed to call from. One per line. Empty = allow any origin (dev convenience)."
            >
              <textarea
                value={originsText}
                onChange={(e) => setOriginsText(e.currentTarget.value)}
                placeholder="https://app.example.com&#10;https://staging.example.com"
                className="w-full min-h-[100px] bg-[var(--color-space-surface)] border border-[var(--color-space-border)] text-[var(--color-star-100)] text-sm rounded p-3 outline-none focus:border-[var(--color-nebula-violet)] font-mono"
              />
            </Field>
            <div className="flex items-center gap-3">
              <Button type="submit" variant="primary" disabled={update.isPending}>
                {update.isPending ? "…" : "Save"}
              </Button>
              {update.isSuccess && (
                <span className="text-xs text-[var(--color-nebula-cyan)]">Saved</span>
              )}
              {update.error && (
                <span className="text-xs text-[var(--color-nebula-rose)]">{update.error.message}</span>
              )}
            </div>
          </form>
        </Surface>
      </section>

      {/* Repo mapping */}
      <section>
        <h2 className="text-xs uppercase tracking-wide text-[var(--color-star-500)] mb-3">
          Repository mapping
        </h2>
        <p className="text-xs text-[var(--color-star-500)] mb-3">
          Lets Claude Code know which repo to work in when it picks up a task.
          Also used to scope sourcemap uploads per release.
        </p>
        <Surface>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const repo =
                repoOwner || repoName
                  ? {
                      provider: repoProvider,
                      owner: repoOwner || undefined,
                      name: repoName || undefined,
                      defaultBranch: repoBranch || undefined,
                      pathPrefix: repoPrefix || undefined,
                    }
                  : null;
              update.mutate({ projectId, repo });
            }}
          >
            <Field label="Provider">
              <select
                value={repoProvider}
                onChange={(e) =>
                  setRepoProvider(e.currentTarget.value as ProjectRepo["provider"])
                }
                className="w-full bg-transparent border-0 border-b border-[var(--color-space-border)] text-[var(--color-star-100)] text-sm py-2 outline-none focus:border-[var(--color-nebula-violet)]"
              >
                <option value="github">github</option>
                <option value="gitlab">gitlab</option>
                <option value="local">local</option>
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Owner">
                <Input
                  type="text"
                  value={repoOwner}
                  onChange={(e) => setRepoOwner(e.currentTarget.value)}
                  placeholder="acme-corp"
                />
              </Field>
              <Field label="Repo name">
                <Input
                  type="text"
                  value={repoName}
                  onChange={(e) => setRepoName(e.currentTarget.value)}
                  placeholder="acme-web"
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Default branch">
                <Input
                  type="text"
                  value={repoBranch}
                  onChange={(e) => setRepoBranch(e.currentTarget.value)}
                  placeholder="main"
                />
              </Field>
              <Field label="Path prefix (monorepo)">
                <Input
                  type="text"
                  value={repoPrefix}
                  onChange={(e) => setRepoPrefix(e.currentTarget.value)}
                  placeholder="apps/web/"
                />
              </Field>
            </div>
            <Button type="submit" variant="primary" disabled={update.isPending}>
              {update.isPending ? "…" : "Repo Save"}
            </Button>
          </form>
        </Surface>
      </section>

      {/* Danger zone */}
      <section>
        <h2 className="text-xs uppercase tracking-wide text-[var(--color-nebula-rose)] mb-3">
          Danger zone
        </h2>
        <Surface className="space-y-3">
          <p className="text-sm text-[var(--color-star-300)]">
            Deleting a project permanently removes all bugs, attachments, tasks and briefs.
            This cannot be undone.
          </p>
          <Field label={`To confirm, type the project name "${initialName}" to confirm`}>
            <Input
              type="text"
              value={confirmDelete}
              onChange={(e) => setConfirmDelete(e.currentTarget.value)}
              placeholder={initialName}
            />
          </Field>
          {del.error && (
            <p className="text-sm text-[var(--color-nebula-rose)]">{del.error.message}</p>
          )}
          <Button
            variant="danger"
            disabled={confirmDelete !== initialName || del.isPending}
            onClick={() => {
              if (confirm("Are you sure? This cannot be undone.")) {
                del.mutate(
                  { projectId },
                  {
                    onSuccess: () => {
                      window.location.href = "/projects";
                    },
                  },
                );
              }
            }}
          >
            {del.isPending ? "…" : "Project Delete"}
          </Button>
        </Surface>
      </section>
    </div>
  );
}
