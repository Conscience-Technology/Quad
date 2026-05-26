"use client";

import { useState } from "react";
import { Button, Code, CopyButton, Field, Input, Surface } from "~/components/ui";
import { trpc } from "~/lib/trpc/react";

type Role = "owner" | "admin" | "member";

export function MembersPanel({ projectId }: { projectId: string }) {
  const list = trpc.members.list.useQuery({ projectId });
  const utils = trpc.useUtils();

  const invite = trpc.members.invite.useMutation({
    onSuccess: async (res) => {
      if (res.kind === "invited" && res.inviteToken) {
        setLastInvite({ email, token: res.inviteToken, emailSent: res.emailSent ?? false });
      } else {
        setLastInvite(null);
      }
      setEmail("");
      await utils.members.list.invalidate({ projectId });
    },
  });
  const approve = trpc.members.approve.useMutation({
    onSettled: () => utils.members.list.invalidate({ projectId }),
  });
  const reject = trpc.members.reject.useMutation({
    onSettled: () => utils.members.list.invalidate({ projectId }),
  });
  const remove = trpc.members.remove.useMutation({
    onSettled: () => utils.members.list.invalidate({ projectId }),
  });
  const changeRole = trpc.members.changeRole.useMutation({
    onSettled: () => utils.members.list.invalidate({ projectId }),
  });

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("member");
  const [lastInvite, setLastInvite] = useState<{ email: string; token: string; emailSent: boolean } | null>(null);

  const inviteUrl = lastInvite
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/signup?invite=${encodeURIComponent(lastInvite.token)}`
    : null;

  return (
    <div className="space-y-8">
      <Surface>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            invite.mutate({ projectId, email, role });
          }}
          className="space-y-4"
        >
          <Field label="Email to invite">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.currentTarget.value)}
              placeholder="teammate@acme.com"
              required
            />
          </Field>
          <Field label="Role">
            <select
              value={role}
              onChange={(e) => setRole(e.currentTarget.value as Role)}
              className="w-full bg-transparent border-0 border-b border-[var(--color-space-border)] text-[var(--color-star-100)] text-sm py-2 outline-none focus:border-[var(--color-nebula-violet)] transition-colors"
            >
              <option value="member">member</option>
              <option value="admin">admin</option>
              <option value="owner">owner</option>
            </select>
          </Field>
          {invite.error && (
            <p className="text-sm text-[var(--color-nebula-rose)]">{invite.error.message}</p>
          )}
          <Button type="submit" variant="primary" disabled={invite.isPending || !email}>
            {invite.isPending ? "..." : "Invite"}
          </Button>
        </form>
      </Surface>

      {inviteUrl && lastInvite && (
        <Surface className="border border-[var(--color-nebula-violet)]/30 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-[var(--color-nebula-violet)] uppercase tracking-wide">
              Invite link ({lastInvite.email})
            </p>
            <CopyButton text={inviteUrl} label="Copy link" />
          </div>
          <Code className="block break-all">{inviteUrl}</Code>
          <p className="text-xs text-[var(--color-star-500)]">
            Expires in 14 days.
            {lastInvite.emailSent ? (
              <span className="text-[var(--color-nebula-green)]"> ✓ Invitation email sent.</span>
            ) : (
              <span> Email not sent (EMAIL_PROVIDER_KEY unset) — copy the link above to share manually.</span>
            )}
          </p>
        </Surface>
      )}

      <div className="space-y-2">
        <h2 className="text-xs uppercase tracking-wide text-[var(--color-star-500)]">Active / Pending</h2>
        {list.isLoading && <p className="text-sm text-[var(--color-star-500)]">Loading…</p>}
        {list.data?.map((m) => (
          <Surface key={m.userId} className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-sm text-[var(--color-star-100)]">{m.name ?? m.email}</p>
              <p className="text-xs text-[var(--color-star-500)] font-mono">{m.email}</p>
              <div className="flex gap-2 text-xs text-[var(--color-star-500)] uppercase tracking-wide pt-1">
                <span>{m.role}</span>
                <span>·</span>
                <span className={m.status === "pending" ? "text-[var(--color-nebula-amber)]" : ""}>
                  {m.status}
                </span>
              </div>
            </div>
            <div className="flex gap-2">
              {m.status === "pending" && (
                <>
                  <Button
                    variant="primary"
                    onClick={() => approve.mutate({ projectId, userId: m.userId })}
                  >
                    Approve
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => reject.mutate({ projectId, userId: m.userId })}
                  >
                    Reject
                  </Button>
                </>
              )}
              {m.status === "active" && (
                <>
                  <select
                    value={m.role}
                    onChange={(e) =>
                      changeRole.mutate({
                        projectId,
                        userId: m.userId,
                        role: e.currentTarget.value as Role,
                      })
                    }
                    className="bg-transparent text-xs text-[var(--color-star-300)] border-b border-[var(--color-space-border)] py-1 outline-none"
                  >
                    <option value="member">member</option>
                    <option value="admin">admin</option>
                    <option value="owner">owner</option>
                  </select>
                  <Button
                    variant="danger"
                    onClick={() => remove.mutate({ projectId, userId: m.userId })}
                  >
                    Remove
                  </Button>
                </>
              )}
            </div>
          </Surface>
        ))}
      </div>
    </div>
  );
}
