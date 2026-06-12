import { serverTrpc } from "~/lib/trpc/server";
import { SettingsGeneralPanel } from "./settings-general";

export const dynamic = "force-dynamic";

export default async function ProjectSettings({
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
        <h1 className="text-2xl tracking-tight">Settings</h1>
        <p className="text-sm text-[var(--color-star-500)] font-mono">{project.slug}</p>
      </header>
      <SettingsGeneralPanel
        projectId={project.id}
        initialName={project.name}
        initialOrigins={project.allowedOrigins}
        initialRepo={project.repo}
      />
    </div>
  );
}
