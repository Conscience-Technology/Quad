"use client";

import { useState } from "react";
import { Button, Code, CopyButton, Field, Input, Surface } from "~/components/ui";
import { trpc } from "~/lib/trpc/react";

export function ApiKeysPanel({
  projectId,
  projectSlug,
}: {
  projectId: string;
  projectSlug: string;
}) {
  const list = trpc.apiKeys.listForProject.useQuery({ projectId });
  const utils = trpc.useUtils();
  const create = trpc.apiKeys.createSdk.useMutation({
    onSuccess: async (res) => {
      setLastIssued({ plain: res.plain, prefix: res.prefix });
      setLabel("");
      await utils.apiKeys.listForProject.invalidate({ projectId });
    },
  });
  const revoke = trpc.apiKeys.revoke.useMutation({
    onSettled: () => utils.apiKeys.listForProject.invalidate({ projectId }),
  });

  const [label, setLabel] = useState("");
  const [lastIssued, setLastIssued] = useState<{ plain: string; prefix: string } | null>(null);

  return (
    <div className="space-y-6">
      <Surface>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate({ projectId, label: label || undefined, env: "production" });
          }}
          className="space-y-4"
        >
          <Field label="Label (optional)" hint="e.g. production / staging">
            <Input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.currentTarget.value)}
              placeholder="production"
            />
          </Field>
          {create.error && (
            <p className="text-sm text-[var(--color-nebula-rose)]">{create.error.message}</p>
          )}
          <Button type="submit" variant="primary" disabled={create.isPending}>
            {create.isPending ? "..." : "+ Issue new SDK key"}
          </Button>
        </form>
      </Surface>

      {lastIssued && (
        <Surface className="border border-[var(--color-nebula-violet)]/30">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-[var(--color-nebula-violet)] uppercase tracking-wide">
                New key (shown once)
              </p>
              <CopyButton text={lastIssued.plain} />
            </div>
            <Code className="block break-all">{lastIssued.plain}</Code>

            <details className="text-sm text-[var(--color-star-300)]" open>
              <summary className="cursor-pointer text-[var(--color-star-500)] hover:text-[var(--color-star-100)]">
                Install (Next.js / React)
              </summary>
              <pre className="mt-3 p-4 bg-[var(--color-space-void)] rounded text-xs overflow-x-auto font-mono">
{`npm i @quad/sdk

// app/layout.tsx
import { QuadProvider } from "@quad/sdk/react";

<QuadProvider
  apiKey="${lastIssued.plain}"
  options={{ video: { enabled: true }, voice: { enabled: true } }}
>
  {children}
</QuadProvider>`}
              </pre>
            </details>

            <details className="text-sm text-[var(--color-star-300)]">
              <summary className="cursor-pointer text-[var(--color-star-500)] hover:text-[var(--color-star-100)]">
                Install via &lt;script&gt; (no npm — served from your Quad instance)
              </summary>
              <pre className="mt-3 p-4 bg-[var(--color-space-void)] rounded text-xs overflow-x-auto font-mono">
{`<!-- Drop this anywhere in your <head> -->
<script type="module">
  import { quad } from "${typeof window !== "undefined" ? window.location.origin : "https://your-quad.example.com"}/sdk/index.js";
  quad.init({
    apiKey: "${lastIssued.plain}",
    endpoint: "${typeof window !== "undefined" ? window.location.origin : "https://your-quad.example.com"}",
    video: { enabled: true },
    voice: { enabled: true },
  });
</script>`}
              </pre>
              <p className="text-xs text-[var(--color-star-500)] mt-2">
                The Quad instance serves the SDK bundle directly at <code>/sdk/index.js</code>.
                No npm publish or build step needed in your host app.
              </p>
            </details>
          </div>
        </Surface>
      )}

      <div className="space-y-2">
        <h2 className="text-xs uppercase tracking-wide text-[var(--color-star-500)]">Active keys</h2>
        {list.isLoading && <p className="text-sm text-[var(--color-star-500)]">Loading…</p>}
        {list.data?.length === 0 && (
          <p className="text-sm text-[var(--color-star-500)]">No keys issued yet.</p>
        )}
        {list.data?.map((k) => (
          <Surface key={k.id} className="flex items-center justify-between">
            <div className="space-y-1">
              <Code>{k.prefix}…</Code>
              {k.label && <p className="text-xs text-[var(--color-star-500)]">{k.label}</p>}
              {k.revokedAt && (
                <p className="text-xs text-[var(--color-nebula-rose)]">revoked</p>
              )}
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

      <p className="text-xs text-[var(--color-star-500)] font-mono pt-4">
        project · {projectSlug}
      </p>
    </div>
  );
}
