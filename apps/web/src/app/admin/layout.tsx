import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { BrandWordmark } from "~/components/ui";
import { TopBar } from "~/components/topbar";
import { AdminNav } from "./admin-nav";
import { getCurrentUser } from "~/lib/auth/current-user";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.isSuperAdmin) redirect("/");

  return (
    <div className="min-h-screen grid grid-cols-[240px_1fr]">
      <aside className="border-r border-space-border bg-space-bg flex flex-col sticky top-0 h-screen">
        <div className="px-4 py-3.5 border-b border-space-border flex items-center justify-between">
          <BrandWordmark />
          <span className="text-2xs uppercase tracking-wider text-nebula-violet">
            admin
          </span>
        </div>
        <AdminNav />
      </aside>

      <div className="min-w-0 flex flex-col">
        <TopBar
          breadcrumb={[{ label: "Admin" }]}
          user={{
            email: user.email,
            name: user.name,
            isSuperAdmin: user.isSuperAdmin,
          }}
        />
        <main className="flex-1 px-8 py-8">{children}</main>
      </div>
    </div>
  );
}
