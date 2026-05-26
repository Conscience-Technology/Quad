import { serverTrpc } from "~/lib/trpc/server";
import { TaskDetail } from "./task-detail";

export const dynamic = "force-dynamic";

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const trpc = await serverTrpc();
  const project = await trpc.projects.bySlug({ slug });
  return <TaskDetail projectId={project.id} projectSlug={project.slug} taskId={id} />;
}
