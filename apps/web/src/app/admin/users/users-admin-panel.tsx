"use client";

import { Button, Surface } from "~/components/ui";
import { trpc } from "~/lib/trpc/react";

export function UsersAdminPanel() {
  const list = trpc.users.list.useQuery();
  const utils = trpc.useUtils();
  const refresh = () => utils.users.list.invalidate();

  const approve = trpc.users.approve.useMutation({ onSettled: refresh });
  const suspend = trpc.users.suspend.useMutation({ onSettled: refresh });
  const reject = trpc.users.reject.useMutation({ onSettled: refresh });

  const users = list.data ?? [];
  const pending = users.filter((u) => u.status === "pending");
  const others = users.filter((u) => u.status !== "pending");

  return (
    <div className="space-y-8">
      <Section
        title={`Pending approval (${pending.length})`}
        empty="No one is waiting."
      >
        {pending.map((u) => (
          <Surface key={u.id} className="flex items-center justify-between">
            <Identity name={u.name} email={u.email} createdAt={u.createdAt} />
            <div className="flex gap-2">
              <Button
                variant="primary"
                disabled={approve.isPending}
                onClick={() => approve.mutate({ userId: u.id })}
              >
                Approve
              </Button>
              <Button
                variant="ghost"
                disabled={reject.isPending}
                onClick={() => reject.mutate({ userId: u.id })}
              >
                Reject
              </Button>
            </div>
          </Surface>
        ))}
      </Section>

      <Section title={`Everyone else (${others.length})`} empty="—">
        {others.map((u) => (
          <Surface key={u.id} className="flex items-center justify-between">
            <Identity
              name={u.name}
              email={u.email}
              createdAt={u.createdAt}
              lastLoginAt={u.lastLoginAt}
            />
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide">
              {u.isSuperAdmin && (
                <span className="text-[var(--color-nebula-violet)]">super</span>
              )}
              <span
                className={
                  u.status === "active"
                    ? "text-[var(--color-star-500)]"
                    : "text-[var(--color-nebula-rose)]"
                }
              >
                {u.status}
              </span>
              {u.status === "active" && !u.isSuperAdmin && (
                <Button
                  variant="ghost"
                  disabled={suspend.isPending}
                  onClick={() => suspend.mutate({ userId: u.id })}
                >
                  Suspend
                </Button>
              )}
            </div>
          </Surface>
        ))}
      </Section>
    </div>
  );
}

function Section({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: React.ReactNode;
}) {
  const arr = Array.isArray(children) ? children : [children];
  const isEmpty = arr.filter(Boolean).length === 0;
  return (
    <section className="space-y-2">
      <h2 className="text-xs uppercase tracking-wide text-[var(--color-star-500)]">
        {title}
      </h2>
      {isEmpty ? (
        <p className="text-sm text-[var(--color-star-500)]">{empty}</p>
      ) : (
        children
      )}
    </section>
  );
}

function Identity({
  name,
  email,
  createdAt,
  lastLoginAt,
}: {
  name: string | null;
  email: string;
  createdAt: Date | string;
  lastLoginAt?: Date | string | null;
}) {
  const created = new Date(createdAt).toISOString().slice(0, 10);
  const last = lastLoginAt
    ? new Date(lastLoginAt).toISOString().slice(0, 10)
    : null;
  return (
    <div className="space-y-1">
      <p className="text-sm text-[var(--color-star-100)]">{name ?? email}</p>
      <p className="text-xs text-[var(--color-star-500)] font-mono">{email}</p>
      <p className="text-xs text-[var(--color-star-700)] font-mono">
        joined {created}
        {last && ` · last ${last}`}
      </p>
    </div>
  );
}
