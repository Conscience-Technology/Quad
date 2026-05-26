"use client";

import { useState } from "react";
import { Button, Field, Input, Surface } from "~/components/ui";
import { trpc } from "~/lib/trpc/react";

export function SettingsForm({
  defaultName,
  defaultSignupOpen,
}: {
  defaultName: string;
  defaultSignupOpen: boolean;
}) {
  const [name, setName] = useState(defaultName);
  const [signupOpen, setSignupOpen] = useState(defaultSignupOpen);
  const update = trpc.instance.update.useMutation();
  const utils = trpc.useUtils();
  return (
    <Surface>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          update.mutate(
            { name, signupOpen },
            { onSuccess: () => utils.instance.info.invalidate() },
          );
        }}
      >
        <Field label="Instance Name">
          <Input
            type="text"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
          />
        </Field>
        <label className="flex items-center gap-3 text-sm text-[var(--color-star-300)] cursor-pointer">
          <input
            type="checkbox"
            checked={signupOpen}
            onChange={(e) => setSignupOpen(e.currentTarget.checked)}
          />
          Allow public signup (when off, only invite links / super admin email can sign up)
        </label>
        {update.error && (
          <p className="text-sm text-[var(--color-nebula-rose)]">{update.error.message}</p>
        )}
        {update.isSuccess && (
          <p className="text-sm text-[var(--color-nebula-cyan)]">Saved</p>
        )}
        <Button type="submit" variant="primary" disabled={update.isPending}>
          {update.isPending ? "…" : "Save"}
        </Button>
      </form>
    </Surface>
  );
}
