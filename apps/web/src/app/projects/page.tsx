import { redirect } from "next/navigation";
import { getCurrentUser } from "~/lib/auth/current-user";
import { ProjectsPanel } from "./projects-panel";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return (
    <ProjectsPanel
      userEmail={user.email}
      userName={user.name}
      isSuperAdmin={user.isSuperAdmin}
    />
  );
}
