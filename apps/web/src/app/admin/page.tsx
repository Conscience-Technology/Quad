import { and, count, eq } from "drizzle-orm";
import Link from "next/link";
import { db, schema } from "~/db";
import { getOrCreateInstance } from "~/lib/instance";
import { env } from "~/lib/env";

export const dynamic = "force-dynamic";

export default async function AdminOverview() {
  const inst = await getOrCreateInstance();
  const [{ value: userCount } = { value: 0 }] = await db
    .select({ value: count() })
    .from(schema.users);
  const [{ value: pendingCount } = { value: 0 }] = await db
    .select({ value: count() })
    .from(schema.users)
    .where(and(eq(schema.users.status, "pending")));
  const [{ value: projectCount } = { value: 0 }] = await db
    .select({ value: count() })
    .from(schema.projects);

  const sttEnabled = !!env().OPENAI_API_KEY;

  return (
    <div className="space-y-10 max-w-2xl">
      <header className="space-y-2">
        <h1 className="text-2xl tracking-tight">Instance</h1>
        <p className="text-sm text-[var(--color-star-500)] font-mono">{inst.name}</p>
      </header>

      <section className="grid grid-cols-2 gap-4">
        <Stat label="Users" value={String(userCount)} />
        <Stat label="Projects" value={String(projectCount)} />
        <Stat label="STT (Whisper)" value={sttEnabled ? "Enabled" : "Disabled"} hint={sttEnabled ? undefined : "OPENAI_API_KEY missing"} />
        <Link href="/admin/users" className="block">
          <Stat
            label="Pending approval"
            value={String(pendingCount)}
            hint={pendingCount > 0 ? "click to review" : undefined}
          />
        </Link>
      </section>

      <section className="space-y-3 pt-6 border-t border-[var(--color-space-border)]">
        <h2 className="text-sm uppercase tracking-wide text-[var(--color-star-500)]">
          Next steps
        </h2>
        <p className="text-sm text-[var(--color-star-300)]">
          Create your first project, issue an SDK key, and drop it into your host app.
          
        </p>
      </section>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-[var(--color-space-surface)] rounded-md p-5 space-y-1">
      <p className="text-xs uppercase tracking-wide text-[var(--color-star-500)]">{label}</p>
      <p className="text-2xl tracking-tight text-[var(--color-star-100)]">{value}</p>
      {hint && <p className="text-xs text-[var(--color-star-500)] font-mono pt-1">{hint}</p>}
    </div>
  );
}
