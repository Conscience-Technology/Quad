import { desc } from "drizzle-orm";
import { db, schema } from "~/db";
import { Code, Surface } from "~/components/ui";

export const dynamic = "force-dynamic";

export default async function AdminAudit() {
  const rows = await db
    .select()
    .from(schema.auditLog)
    .orderBy(desc(schema.auditLog.createdAt))
    .limit(200);
  return (
    <div className="max-w-3xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl tracking-tight">Audit log</h1>
        <p className="text-sm text-[var(--color-star-500)]">Last {rows.length} events.</p>
      </header>
      <div className="space-y-1">
        {rows.length === 0 && (
          <p className="text-sm text-[var(--color-star-500)]">None yet.</p>
        )}
        {rows.map((r) => (
          <Surface key={r.id} className="!p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-0.5 min-w-0">
                <p className="text-sm font-mono text-[var(--color-star-100)]">{r.action}</p>
                <p className="text-xs text-[var(--color-star-500)] font-mono truncate">
                  {r.whoKind}{r.whoId ? `:${r.whoId.slice(0, 8)}` : ""}
                  {r.target && ` → ${r.target.slice(0, 36)}`}
                </p>
              </div>
              <span className="text-xs text-[var(--color-star-700)] font-mono shrink-0">
                {r.createdAt.toISOString().replace("T", " ").slice(0, 19)}
              </span>
            </div>
            {Object.keys(r.meta).length > 0 && (
              <Code className="block mt-2 break-all">
                {JSON.stringify(r.meta)}
              </Code>
            )}
          </Surface>
        ))}
      </div>
    </div>
  );
}
