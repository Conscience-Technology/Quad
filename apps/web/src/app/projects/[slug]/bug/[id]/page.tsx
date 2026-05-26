import { serverTrpc } from "~/lib/trpc/server";
import { BugDetail } from "./bug-detail";

export const dynamic = "force-dynamic";

export default async function BugDetailPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const trpc = await serverTrpc();
  const project = await trpc.projects.bySlug({ slug });
  return <BugDetail projectId={project.id} projectSlug={project.slug} bugId={id} />;
}
