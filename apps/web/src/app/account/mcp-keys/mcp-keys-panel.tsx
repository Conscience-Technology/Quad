"use client";

import { useState } from "react";
import { Button, Code, CopyButton, Field, Input, Surface } from "~/components/ui";
import { trpc } from "~/lib/trpc/react";

export function McpKeysPanel({
  projects,
}: {
  projects: Array<{ id: string; slug: string; name: string }>;
}) {
  const list = trpc.apiKeys.listMine.useQuery();
  const integrations = trpc.integrations.listMine.useQuery();
  const utils = trpc.useUtils();
  const create = trpc.apiKeys.createMcp.useMutation({
    onSuccess: async (res) => {
      setLastIssued({
        plain: res.plain,
        prefix: res.prefix,
        expiresAt: res.expiresAt,
      });
      setLabel("");
      await utils.apiKeys.listMine.invalidate();
    },
  });
  const revoke = trpc.apiKeys.revoke.useMutation({
    onSettled: () => utils.apiKeys.listMine.invalidate(),
  });
  const saveAzurePat = trpc.integrations.saveAzureDevOpsPat.useMutation({
    onSuccess: async () => {
      setAzurePat("");
      await utils.integrations.listMine.invalidate();
    },
  });
  const deleteAzurePat = trpc.integrations.deleteAzureDevOpsPat.useMutation({
    onSettled: () => utils.integrations.listMine.invalidate(),
  });

  const [label, setLabel] = useState("");
  const [azureOrg, setAzureOrg] = useState("");
  const [azurePat, setAzurePat] = useState("");
  const [selectedProjects, setSelectedProjects] = useState<string[]>(
    projects.map((p) => p.id),
  );
  const [days, setDays] = useState(90);
  const [lastIssued, setLastIssued] = useState<{
    plain: string;
    prefix: string;
    expiresAt: Date;
  } | null>(null);

  const endpoint = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <div className="space-y-6">
      <Surface>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!azureOrg.trim() || !azurePat.trim()) return;
            saveAzurePat.mutate({
              organization: azureOrg.trim(),
              pat: azurePat.trim(),
            });
          }}
        >
          <div>
            <h2 className="text-xs uppercase tracking-wide text-[var(--color-star-500)]">
              Azure DevOps identity
            </h2>
            <p className="mt-1 text-xs text-[var(--color-star-500)]">
              Used when your Quad comments or MCP actions sync to Azure Boards.
              The token is encrypted and never shown again.
            </p>
          </div>
          <Field label="Organization">
            <Input
              type="text"
              value={azureOrg}
              onChange={(e) => setAzureOrg(e.currentTarget.value)}
              placeholder="SG-Collaboration-Projects"
            />
          </Field>
          <Field label="Personal access token" hint="Minimum scope: Work Items read/write">
            <Input
              type="password"
              value={azurePat}
              onChange={(e) => setAzurePat(e.currentTarget.value)}
              placeholder="Azure DevOps PAT"
            />
          </Field>
          {saveAzurePat.error && (
            <p className="text-sm text-[var(--color-nebula-rose)]">{saveAzurePat.error.message}</p>
          )}
          <Button
            type="submit"
            variant="primary"
            disabled={!azureOrg.trim() || !azurePat.trim() || saveAzurePat.isPending}
          >
            {saveAzurePat.isPending ? "…" : "Save Azure DevOps PAT"}
          </Button>
        </form>
      </Surface>

      <div className="space-y-2">
        <h2 className="text-xs uppercase tracking-wide text-[var(--color-star-500)]">
          My Azure DevOps tokens
        </h2>
        {integrations.isLoading && <p className="text-sm text-[var(--color-star-500)]">…</p>}
        {integrations.data?.length === 0 && (
          <p className="text-sm text-[var(--color-star-500)]">None yet.</p>
        )}
        {integrations.data?.map((i) => (
          <Surface key={i.id} className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-sm text-[var(--color-star-100)]">{i.organization}</p>
              <p className="text-xs text-[var(--color-star-500)] font-mono">
                {i.secretPrefix ? `${i.secretPrefix}…` : "saved"} · updated {i.updatedAt.toISOString().slice(0, 10)}
              </p>
            </div>
            <Button
              variant="danger"
              disabled={deleteAzurePat.isPending}
              onClick={() => deleteAzurePat.mutate({ organization: i.organization })}
            >
              delete
            </Button>
          </Surface>
        ))}
      </div>

      <Surface>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (selectedProjects.length === 0) return;
            create.mutate({
              label: label || undefined,
              projectIds: selectedProjects,
              expiresInDays: days,
            });
          }}
        >
          <Field label="Label (optional)">
            <Input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.currentTarget.value)}
              placeholder="my laptop"
            />
          </Field>
          <Field
            label="Accessible projects"
            hint="Projects this key can act on. One key can scope multiple projects."
          >
            <div className="space-y-1.5 pt-1">
              {projects.length === 0 && (
                <p className="text-xs text-[var(--color-star-500)]">
                  You're not a member of any project.
                </p>
              )}
              {projects.map((p) => {
                const checked = selectedProjects.includes(p.id);
                return (
                  <label
                    key={p.id}
                    className="flex items-center gap-3 text-sm text-[var(--color-star-300)] cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        if (e.currentTarget.checked) {
                          setSelectedProjects([...selectedProjects, p.id]);
                        } else {
                          setSelectedProjects(
                            selectedProjects.filter((id) => id !== p.id),
                          );
                        }
                      }}
                    />
                    <span>{p.name}</span>
                    <span className="text-xs text-[var(--color-star-500)] font-mono">
                      {p.slug}
                    </span>
                  </label>
                );
              })}
            </div>
          </Field>
          <Field label="Expires in (days)">
            <Input
              type="text"
              value={String(days)}
              onChange={(e) => setDays(Number.parseInt(e.currentTarget.value || "0", 10) || 90)}
              placeholder="90"
            />
          </Field>
          {create.error && (
            <p className="text-sm text-[var(--color-nebula-rose)]">{create.error.message}</p>
          )}
          <Button
            type="submit"
            variant="primary"
            disabled={create.isPending || selectedProjects.length === 0}
          >
            {create.isPending ? "…" : "+ Issue new MCP key"}
          </Button>
        </form>
      </Surface>

      {lastIssued && (
        <Surface className="border border-[var(--color-nebula-violet)]/40 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-[var(--color-nebula-violet)] uppercase tracking-wide">
              New key (shown once)
            </p>
            <CopyButton text={lastIssued.plain} />
          </div>
          <Code className="block break-all">{lastIssued.plain}</Code>
          <p className="text-xs text-[var(--color-star-500)]">
            Expires: {lastIssued.expiresAt.toISOString().slice(0, 10)}
          </p>

          <details>
            <summary className="cursor-pointer text-xs text-[var(--color-star-500)] hover:text-[var(--color-star-100)]">
              Claude Code MCP config snippet
            </summary>
            <pre className="mt-3 p-4 bg-[var(--color-space-void)] rounded text-xs overflow-x-auto font-mono text-[var(--color-star-300)]">
{`// ~/.config/claude-code/mcp.json
{
  "mcpServers": {
    "quad": {
      "command": "npx",
      "args": ["-y", "@quad/mcp"],
      "env": {
        "QUAD_API_KEY": "${lastIssued.plain}",
        "QUAD_ENDPOINT": "${endpoint}"
      }
    }
  }
}`}
            </pre>
          </details>

          <details>
            <summary className="cursor-pointer text-xs text-[var(--color-star-500)] hover:text-[var(--color-star-100)]">
              CLI Sign in snippet
            </summary>
            <pre className="mt-3 p-4 bg-[var(--color-space-void)] rounded text-xs overflow-x-auto font-mono text-[var(--color-star-300)]">
{`npx @quad/cli login \\
  --endpoint ${endpoint} \\
  --key ${lastIssued.plain}

npx quad list
npx quad pull --next`}
            </pre>
          </details>
        </Surface>
      )}

      <div className="space-y-2">
        <h2 className="text-xs uppercase tracking-wide text-[var(--color-star-500)]">
          My MCP keys
        </h2>
        {list.isLoading && <p className="text-sm text-[var(--color-star-500)]">…</p>}
        {list.data?.length === 0 && (
          <p className="text-sm text-[var(--color-star-500)]">None yet.</p>
        )}
        {list.data?.map((k) => (
          <Surface key={k.id} className="flex items-center justify-between">
            <div className="space-y-1">
              <Code>{k.prefix}…</Code>
              {k.label && <p className="text-xs text-[var(--color-star-500)]">{k.label}</p>}
              <p className="text-xs text-[var(--color-star-500)] font-mono">
                {k.revokedAt
                  ? "revoked"
                  : k.expiresAt && k.expiresAt < new Date()
                    ? "expired"
                    : k.expiresAt
                      ? `expires ${k.expiresAt.toISOString().slice(0, 10)}`
                      : "no expiry"}
                {k.lastUsedAt && ` · last used ${k.lastUsedAt.toISOString().slice(0, 10)}`}
              </p>
            </div>
            {!k.revokedAt && (
              <Button
                variant="danger"
                onClick={() => revoke.mutate({ apiKeyId: k.id })}
                disabled={revoke.isPending}
              >
                revoke
              </Button>
            )}
          </Surface>
        ))}
      </div>
    </div>
  );
}
