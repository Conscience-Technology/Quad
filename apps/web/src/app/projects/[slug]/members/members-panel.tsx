"use client";

import { useState } from "react";
import { Button, Code, CopyButton, Field, Input, Select, Surface } from "~/components/ui";
import { trpc } from "~/lib/trpc/react";

type Role = "owner" | "admin" | "member";

export function MembersPanel({ projectId }: { projectId: string }) {
  const list = trpc.members.list.useQuery({ projectId });
  const utils = trpc.useUtils();

  const invite = trpc.members.invite.useMutation({
    onSuccess: async (res) => {
      if (res.kind === "invited" && res.inviteToken) {
        setLastInvite({ email, token: res.inviteToken });
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
  const [lastInvite, setLastInvite] = useState<{ email: string; token: string } | null>(null);

  const inviteUrl = lastInvite
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/signup?invite=${encodeURIComponent(lastInvite.token)}`
    : null;

  return (
    <div className="max-w-5xl space-y-8">
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
            <Select
              value={role}
              onChange={(e) => setRole(e.currentTarget.value as Role)}
            >
              <option value="member">member</option>
              <option value="admin">admin</option>
              <option value="owner">owner</option>
            </Select>
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
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="break-words text-sm text-[var(--color-nebula-violet)] uppercase tracking-wide">
              Invite link ({lastInvite.email})
            </p>
            <CopyButton text={inviteUrl} label="Copy link" />
          </div>
          <Code className="block break-all">{inviteUrl}</Code>
          <p className="text-xs text-[var(--color-star-500)]">
            Expires in 14 days. Share this link with{" "}
            <span className="font-mono">{lastInvite.email}</span> — Quad
            doesn&apos;t send email on your behalf.
          </p>
        </Surface>
      )}

      <div className="space-y-2">
        <h2 className="text-xs uppercase tracking-wide text-[var(--color-star-500)]">Active / Pending</h2>
        {list.isLoading && <p className="text-sm text-[var(--color-star-500)]">Loading…</p>}
        {list.data?.map((m) => (
          <Surface key={m.userId} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 space-y-1">
              <p className="break-words text-sm text-[var(--color-star-100)]">{m.name ?? m.email}</p>
              <p className="break-all text-xs text-[var(--color-star-500)] font-mono">{m.email}</p>
              <div className="flex gap-2 text-xs text-[var(--color-star-500)] uppercase tracking-wide pt-1">
                <span>{m.role}</span>
                <span>·</span>
                <span className={m.status === "pending" ? "text-[var(--color-nebula-amber)]" : ""}>
                  {m.status}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
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
                  <Select
                    value={m.role}
                    onChange={(e) =>
                      changeRole.mutate({
                        projectId,
                        userId: m.userId,
                        role: e.currentTarget.value as Role,
                      })
                    }
                    className="w-auto min-w-32"
                  >
                    <option value="member">member</option>
                    <option value="admin">admin</option>
                    <option value="owner">owner</option>
                  </Select>
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
