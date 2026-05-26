import { serverTrpc } from "~/lib/trpc/server";
import { BugColumnView } from "../bug-column-view";

export const dynamic = "force-dynamic";

export default async function TriagePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const trpc = await serverTrpc();
  const project = await trpc.projects.bySlug({ slug });
  return (
    <BugColumnView
      projectId={project.id}
      projectSlug={project.slug}
      status="triaging"
      title="Triage"
      hint="Bugs awaiting more info. Confirm, Resolve or mark Won't do."
    />
  );
}
