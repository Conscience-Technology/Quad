import { serverTrpc } from "~/lib/trpc/server";
import { ResolvedView } from "./resolved-view";

export const dynamic = "force-dynamic";

export default async function ResolvedPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const trpc = await serverTrpc();
  const project = await trpc.projects.bySlug({ slug });
  return <ResolvedView projectId={project.id} projectSlug={project.slug} />;
}
