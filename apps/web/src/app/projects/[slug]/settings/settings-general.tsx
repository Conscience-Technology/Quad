"use client";

import { useState } from "react";
import { Button, Code, Field, Input, Surface } from "~/components/ui";
import { trpc } from "~/lib/trpc/react";
import type { AzureDevOpsConfig, ProjectRepo } from "~/db/schema";

const AZURE_DEVOPS_STATES = [
  "To Do",
  "In Progress",
  "Reopened",
  "Published",
  "Resolved",
  "Reviewed",
  "Done",
];

export function SettingsGeneralPanel({
  projectId,
  initialName,
  initialOrigins,
  initialRepo,
  initialAzureDevOps,
}: {
  projectId: string;
  initialName: string;
  initialOrigins: string[];
  initialRepo: ProjectRepo | null;
  initialAzureDevOps: AzureDevOpsConfig | null;
}) {
  const utils = trpc.useUtils();
  const update = trpc.projects.update.useMutation({
    onSuccess: () => utils.projects.list.invalidate(),
  });
  const del = trpc.projects.delete.useMutation();
  const testAzure = trpc.integrations.testAzureDevOps.useMutation();

  const [name, setName] = useState(initialName);
  const [originsText, setOriginsText] = useState(initialOrigins.join("\n"));
  const [repoProvider, setRepoProvider] = useState<ProjectRepo["provider"]>(
    initialRepo?.provider ?? "github",
  );
  const [repoOwner, setRepoOwner] = useState(initialRepo?.owner ?? "");
  const [repoName, setRepoName] = useState(initialRepo?.name ?? "");
  const [repoBranch, setRepoBranch] = useState(initialRepo?.defaultBranch ?? "main");
  const [repoPrefix, setRepoPrefix] = useState(initialRepo?.pathPrefix ?? "");
  const [adoEnabled, setAdoEnabled] = useState(initialAzureDevOps?.enabled ?? false);
  const [adoOrg, setAdoOrg] = useState(initialAzureDevOps?.organization ?? "");
  const [adoProject, setAdoProject] = useState(initialAzureDevOps?.project ?? "");
  const [adoReportState, setAdoReportState] = useState(initialAzureDevOps?.reportState ?? "Reopened");
  const [adoQueued, setAdoQueued] = useState(initialAzureDevOps?.stateMap?.queued ?? "To Do");
  const [adoPicked, setAdoPicked] = useState(initialAzureDevOps?.stateMap?.picked ?? "In Progress");
  const [adoInProgress, setAdoInProgress] = useState(
    initialAzureDevOps?.stateMap?.in_progress ?? "In Progress",
  );
  const [adoPrOpen, setAdoPrOpen] = useState(initialAzureDevOps?.stateMap?.pr_open ?? "Reviewed");
  const [adoDone, setAdoDone] = useState(initialAzureDevOps?.stateMap?.done ?? "Done");
  const [adoWontDo, setAdoWontDo] = useState(initialAzureDevOps?.stateMap?.wont_do ?? "Resolved");
  const [adoTestWorkItemId, setAdoTestWorkItemId] = useState("");
  const [confirmDelete, setConfirmDelete] = useState("");

  const parsedOrigins = originsText
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);

  const hasRepo = Boolean(repoOwner.trim() && repoName.trim());
  const hasAzureConfig = Boolean(adoEnabled && adoOrg.trim() && adoProject.trim());
  const setupItems = [
    { label: "Project created", done: true },
    { label: "Allowed SDK origin configured", done: parsedOrigins.length > 0 },
    { label: "Repository mapping configured", done: hasRepo },
    { label: "Issue tracker integration configured", done: hasAzureConfig },
    { label: "Azure DevOps connection tested", done: testAzure.isSuccess && testAzure.data?.ok },
  ];

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-xs uppercase tracking-wide text-[var(--color-star-500)] mb-3">
          Setup
        </h2>
        <Surface>
          <div className="grid gap-3 sm:grid-cols-5">
            {setupItems.map((item) => (
              <div key={item.label} className="min-w-0">
                <p className={`text-xs ${item.done ? "text-[var(--color-nebula-cyan)]" : "text-[var(--color-star-500)]"}`}>
                  {item.done ? "●" : "○"} {item.label}
                </p>
              </div>
            ))}
          </div>
        </Surface>
      </section>

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

      {/* Integrations */}
      <section>
        <div className="flex items-end justify-between gap-4 mb-3">
          <div>
            <h2 className="text-xs uppercase tracking-wide text-[var(--color-star-500)]">
              Integrations
            </h2>
            <p className="text-xs text-[var(--color-star-500)] mt-1">
              Issue tracker sync uses provider config here and credentials from Account → MCP keys or server env.
            </p>
          </div>
          <span className={`text-2xs uppercase tracking-wider ${hasAzureConfig ? "text-[var(--color-nebula-cyan)]" : "text-[var(--color-star-500)]"}`}>
            Azure DevOps {hasAzureConfig ? "configured" : "not configured"}
          </span>
        </div>
        <Surface className="space-y-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="text-base text-[var(--color-star-100)]">Azure DevOps</h3>
              <p className="text-xs text-[var(--color-star-500)] mt-1">
                Links Quad reports and tasks to Azure Boards work items.
              </p>
            </div>
            <div className="text-xs text-[var(--color-star-500)] sm:text-right">
              <p>SDK reports use server `AZURE_DEVOPS_PAT`.</p>
              <p>Dashboard and MCP actions prefer each user's saved PAT.</p>
            </div>
          </div>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const azureDevOps =
                adoEnabled || adoOrg || adoProject
                  ? {
                      enabled: adoEnabled,
                      organization: adoOrg || undefined,
                      project: adoProject || undefined,
                      reportState: adoReportState || undefined,
                      stateMap: {
                        queued: adoQueued || undefined,
                        picked: adoPicked || undefined,
                        in_progress: adoInProgress || undefined,
                        pr_open: adoPrOpen || undefined,
                        done: adoDone || undefined,
                        wont_do: adoWontDo || undefined,
                      },
                    }
                  : null;
              update.mutate({ projectId, azureDevOps });
            }}
          >
            <label className="flex items-center gap-2 text-sm text-[var(--color-star-300)]">
              <input
                type="checkbox"
                checked={adoEnabled}
                onChange={(e) => setAdoEnabled(e.currentTarget.checked)}
              />
              Enable Azure DevOps sync
            </label>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Organization">
                <Input
                  type="text"
                  value={adoOrg}
                  onChange={(e) => setAdoOrg(e.currentTarget.value)}
                  placeholder="Conscience-Technology"
                />
              </Field>
              <Field label="Project">
                <Input
                  type="text"
                  value={adoProject}
                  onChange={(e) => setAdoProject(e.currentTarget.value)}
                  placeholder="CURECA"
                />
              </Field>
            </div>
            <Field
              label="Report submitted →"
              hint="When an SDK report includes an issue number, Quad sets Azure Boards to this state and adds a comment."
            >
              <Input
                type="text"
                list="azure-devops-states"
                value={adoReportState}
                onChange={(e) => setAdoReportState(e.currentTarget.value)}
                placeholder="Reopened"
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="queued →">
                <Input type="text" list="azure-devops-states" value={adoQueued} onChange={(e) => setAdoQueued(e.currentTarget.value)} />
              </Field>
              <Field label="picked →">
                <Input type="text" list="azure-devops-states" value={adoPicked} onChange={(e) => setAdoPicked(e.currentTarget.value)} />
              </Field>
              <Field label="in_progress →">
                <Input type="text" list="azure-devops-states" value={adoInProgress} onChange={(e) => setAdoInProgress(e.currentTarget.value)} />
              </Field>
              <Field label="pr_open →">
                <Input type="text" list="azure-devops-states" value={adoPrOpen} onChange={(e) => setAdoPrOpen(e.currentTarget.value)} />
              </Field>
              <Field label="done →">
                <Input type="text" list="azure-devops-states" value={adoDone} onChange={(e) => setAdoDone(e.currentTarget.value)} />
              </Field>
              <Field label="wont_do →">
                <Input type="text" list="azure-devops-states" value={adoWontDo} onChange={(e) => setAdoWontDo(e.currentTarget.value)} />
              </Field>
            </div>
            <datalist id="azure-devops-states">
              {AZURE_DEVOPS_STATES.map((state) => (
                <option key={state} value={state} />
              ))}
            </datalist>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" variant="primary" disabled={update.isPending}>
                {update.isPending ? "…" : "Save Azure DevOps"}
              </Button>
              {update.isSuccess && (
                <span className="text-xs text-[var(--color-nebula-cyan)]">Saved</span>
              )}
              {update.error && (
                <span className="text-xs text-[var(--color-nebula-rose)]">{update.error.message}</span>
              )}
            </div>
          </form>
          <div className="border-t border-[var(--color-space-border)] pt-4 space-y-3">
            <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
              <Field
                label="Test Work Item"
                hint="Optional. Leave empty to test only project and credential access."
              >
                <Input
                  type="number"
                  min="1"
                  value={adoTestWorkItemId}
                  onChange={(e) => setAdoTestWorkItemId(e.currentTarget.value)}
                  placeholder="8995"
                />
              </Field>
              <Button
                type="button"
                variant="ghost"
                disabled={!adoOrg.trim() || !adoProject.trim() || testAzure.isPending}
                onClick={() =>
                  testAzure.mutate({
                    organization: adoOrg.trim(),
                    project: adoProject.trim(),
                    workItemId: adoTestWorkItemId.trim()
                      ? Number.parseInt(adoTestWorkItemId.trim(), 10)
                      : undefined,
                  })
                }
              >
                {testAzure.isPending ? "…" : "Test connection"}
              </Button>
            </div>
            {testAzure.data && (
              <p className={`text-xs ${testAzure.data.ok ? "text-[var(--color-nebula-cyan)]" : "text-[var(--color-nebula-rose)]"}`}>
                {testAzure.data.ok ? "Connected" : "Not connected"} · {testAzure.data.message}
                {"credentialSource" in testAzure.data && testAzure.data.credentialSource !== "missing"
                  ? ` · credential: ${testAzure.data.credentialSource}`
                  : ""}
              </p>
            )}
            {testAzure.error && (
              <p className="text-xs text-[var(--color-nebula-rose)]">{testAzure.error.message}</p>
            )}
          </div>
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
