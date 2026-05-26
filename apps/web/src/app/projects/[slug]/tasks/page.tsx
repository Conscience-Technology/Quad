import { serverTrpc } from "~/lib/trpc/server";
import { TasksList } from "./tasks-list";

export const dynamic = "force-dynamic";

export default async function TasksPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const trpc = await serverTrpc();
  const project = await trpc.projects.bySlug({ slug });
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl tracking-tight">Tasks</h1>
        <p className="text-sm text-[var(--color-star-500)]">
          Confirmed bugs become tasks for Claude Code (via MCP) or for humans to pick up.
        </p>
      </header>
      <TasksList projectId={project.id} projectSlug={project.slug} />
    </div>
  );
}
