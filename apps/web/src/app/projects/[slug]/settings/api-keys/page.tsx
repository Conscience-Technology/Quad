import { serverTrpc } from "~/lib/trpc/server";
import { ApiKeysPanel } from "./api-keys-panel";

export const dynamic = "force-dynamic";

export default async function ApiKeysPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const trpc = await serverTrpc();
  const project = await trpc.projects.bySlug({ slug });
  return (
    <div className="max-w-3xl space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl tracking-tight">API keys</h1>
        <p className="text-sm text-[var(--color-star-500)]">
          SDK keys are Used in your host app (browser). Designed to be safe even when exposed —
          every call is origin-checked + rate-limited.
        </p>
      </header>
      <ApiKeysPanel projectId={project.id} projectSlug={project.slug} />
    </div>
  );
}
