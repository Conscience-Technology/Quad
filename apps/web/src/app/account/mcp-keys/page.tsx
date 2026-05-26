import { redirect } from "next/navigation";
import { getCurrentUser } from "~/lib/auth/current-user";
import { serverTrpc } from "~/lib/trpc/server";
import { McpKeysPanel } from "./mcp-keys-panel";

export const dynamic = "force-dynamic";

export default async function McpKeysPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const trpc = await serverTrpc();
  const projects = await trpc.projects.list();

  return (
    <main className="min-h-screen px-10 py-8 max-w-3xl mx-auto space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl tracking-tight">MCP keys</h1>
        <p className="text-sm text-[var(--color-star-500)]">
          Keys used by Claude Code or `@quad/cli`. Issued per user;
          the accessible project list is baked into the key.
        </p>
        <p className="text-xs text-[var(--color-star-500)] font-mono">{user.email}</p>
      </header>
      <McpKeysPanel
        projects={projects.map((p) => ({ id: p.id, slug: p.slug, name: p.name }))}
      />
    </main>
  );
}
