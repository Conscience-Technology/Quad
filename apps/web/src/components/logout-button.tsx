"use client";

import { useRouter } from "next/navigation";
import { trpc } from "~/lib/trpc/react";

export function LogoutButton() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const logout = trpc.auth.logout.useMutation({
    onSettled: async () => {
      await utils.invalidate();
      router.replace("/login");
      router.refresh();
    },
  });
  return (
    <button
      type="button"
      onClick={() => logout.mutate()}
      disabled={logout.isPending}
      className="text-[var(--color-star-500)] hover:text-[var(--color-star-100)] disabled:opacity-40"
    >
      {logout.isPending ? "..." : "Sign out"}
    </button>
  );
}
