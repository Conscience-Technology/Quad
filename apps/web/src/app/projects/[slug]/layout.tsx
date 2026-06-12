import { TRPCError } from "@trpc/server";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { BrandWordmark } from "~/components/ui";
import { TopBar } from "~/components/topbar";
import { ProjectNav } from "./project-nav";
import { getCurrentUser } from "~/lib/auth/current-user";
import { serverTrpc } from "~/lib/trpc/server";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const trpc = await serverTrpc();
  let project: Awaited<ReturnType<typeof trpc.projects.bySlug>>;
  try {
    project = await trpc.projects.bySlug({ slug });
  } catch (err) {
    if (
      err instanceof TRPCError &&
      (err.code === "NOT_FOUND" || err.code === "FORBIDDEN")
    ) {
      notFound();
    }
    throw err;
  }
  const user = await getCurrentUser();

  return (
    <div className="min-h-screen grid grid-cols-[240px_1fr]">
      <aside className="border-r border-space-border bg-space-bg flex flex-col sticky top-0 h-screen">
        <div className="px-4 py-3.5 border-b border-space-border">
          <BrandWordmark />
        </div>
        <ProjectNav
          slug={project.slug}
          projectName={project.name}
          projectId={project.id}
        />
      </aside>

      <div className="min-w-0 flex flex-col">
        <TopBar
          breadcrumb={[
            { label: "Projects", href: "/projects" },
            { label: project.name },
          ]}
          user={
            user
              ? {
                  email: user.email,
                  name: user.name,
                  isSuperAdmin: user.isSuperAdmin,
                }
              : undefined
          }
        />
        <main className="flex-1 px-8 py-8">{children}</main>
      </div>
    </div>
  );
}
