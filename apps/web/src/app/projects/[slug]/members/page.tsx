import { serverTrpc } from "~/lib/trpc/server";
import { MembersPanel } from "./members-panel";

export const dynamic = "force-dynamic";

export default async function MembersPage({
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
        <h1 className="text-2xl tracking-tight">Members</h1>
        <p className="text-sm text-[var(--color-star-500)]">
          Owners and Admins invite members or approve join requests.
        </p>
      </header>
      <MembersPanel projectId={project.id} />
    </div>
  );
}
