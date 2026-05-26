"use client";

import { useState } from "react";
import { Button, Field, Input, Surface } from "~/components/ui";
import { trpc } from "~/lib/trpc/react";

export function SettingsForm({ defaultName }: { defaultName: string }) {
  const [name, setName] = useState(defaultName);
  const update = trpc.instance.update.useMutation();
  const utils = trpc.useUtils();
  return (
    <Surface>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          update.mutate(
            { name },
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
