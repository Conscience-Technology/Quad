import { serverTrpc } from "~/lib/trpc/server";
import { BoardPanel } from "./board-panel";

export const dynamic = "force-dynamic";

export default async function ProjectBoard({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const trpc = await serverTrpc();
  const project = await trpc.projects.bySlug({ slug });
  return <BoardPanel projectId={project.id} projectSlug={project.slug} />;
}
