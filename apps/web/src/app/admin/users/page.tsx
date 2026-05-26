import { desc } from "drizzle-orm";
import { db, schema } from "~/db";
import { Surface } from "~/components/ui";

export const dynamic = "force-dynamic";

export default async function AdminUsers() {
  const users = await db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      name: schema.users.name,
      isSuperAdmin: schema.users.isSuperAdmin,
      isActive: schema.users.isActive,
      lastLoginAt: schema.users.lastLoginAt,
      createdAt: schema.users.createdAt,
    })
    .from(schema.users)
    .orderBy(desc(schema.users.createdAt))
    .limit(200);

  return (
    <div className="max-w-3xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl tracking-tight">Users</h1>
        <p className="text-sm text-[var(--color-star-500)]">
          All instance users. {users.length}.
        </p>
      </header>
      <div className="space-y-2">
        {users.length === 0 && (
          <p className="text-sm text-[var(--color-star-500)]">None yet.</p>
        )}
        {users.map((u) => (
          <Surface key={u.id} className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-sm text-[var(--color-star-100)]">{u.name ?? u.email}</p>
              <p className="text-xs text-[var(--color-star-500)] font-mono">{u.email}</p>
              <p className="text-xs text-[var(--color-star-700)] font-mono">
                joined {u.createdAt.toISOString().slice(0, 10)}
                {u.lastLoginAt && ` · last ${u.lastLoginAt.toISOString().slice(0, 10)}`}
              </p>
            </div>
            <div className="flex gap-2 text-xs uppercase tracking-wide">
              {u.isSuperAdmin && (
                <span className="text-[var(--color-nebula-violet)]">super</span>
              )}
              <span className={u.isActive ? "text-[var(--color-star-500)]" : "text-[var(--color-nebula-rose)]"}>
                {u.isActive ? "active" : "inactive"}
              </span>
            </div>
          </Surface>
        ))}
      </div>
    </div>
  );
}
