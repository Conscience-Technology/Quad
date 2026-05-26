import Link from "next/link";
import { count, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "~/db";
import { Surface } from "~/components/ui";

export const dynamic = "force-dynamic";

export default async function AdminProjects() {
  // Project + bug count + member count via subqueries.
  const projects = await db
    .select({
      id: schema.projects.id,
      slug: schema.projects.slug,
      name: schema.projects.name,
      createdAt: schema.projects.createdAt,
      memberCount: sql<number>`(SELECT count(*)::int FROM ${schema.projectMembers} WHERE ${schema.projectMembers.projectId} = ${schema.projects.id} AND ${schema.projectMembers.status} = 'active')`,
      bugCount: sql<number>`(SELECT count(*)::int FROM ${schema.bugReports} WHERE ${schema.bugReports.projectId} = ${schema.projects.id})`,
    })
    .from(schema.projects)
    .orderBy(desc(schema.projects.createdAt));

  return (
    <div className="max-w-3xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl tracking-tight">Projects</h1>
        <p className="text-sm text-[var(--color-star-500)]">
          All projects. {projects.length}.
        </p>
      </header>
      <div className="space-y-2">
        {projects.length === 0 && (
          <p className="text-sm text-[var(--color-star-500)]">
            No projects yet. <Link href="/projects" className="text-[var(--color-nebula-cyan)]">/projects</Link> to create one.
          </p>
        )}
        {projects.map((p) => (
          <Link key={p.id} href={`/projects/${p.slug}`}>
            <Surface className="hover:bg-[var(--color-space-elevated)] cursor-pointer transition-colors flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm text-[var(--color-star-100)]">{p.name}</p>
                <p className="text-xs text-[var(--color-star-500)] font-mono">{p.slug}</p>
              </div>
              <div className="text-xs text-[var(--color-star-500)] font-mono space-x-3">
                <span>{p.memberCount} members</span>
                <span>{p.bugCount} bugs</span>
              </div>
            </Surface>
          </Link>
        ))}
      </div>
    </div>
  );
}
