"use client";

import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Button, Field, Input } from "~/components/ui";
import { trpc } from "~/lib/trpc/react";

type Mode = "login" | "signup";

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const invitationToken = searchParams.get("invite") ?? undefined;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const utils = trpc.useUtils();

  const [pendingNotice, setPendingNotice] = useState(false);

  const onDone = async (
    res: { id: string; email: string; isSuperAdmin: boolean },
  ) => {
    await utils.auth.me.invalidate();
    router.replace(res.isSuperAdmin ? "/admin" : "/");
    router.refresh();
  };

  const login = trpc.auth.login.useMutation({
    onSuccess: onDone,
    onError: (e) => setError(e.message),
  });
  const signup = trpc.auth.signup.useMutation({
    onSuccess: (res) => {
      if (res.status === "pending") {
        setPendingNotice(true);
        return;
      }
      void onDone(res);
    },
    onError: (e) => setError(e.message),
  });

  const submitting = login.isPending || signup.isPending;
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    if (mode === "login") {
      login.mutate({ email, password });
    } else {
      signup.mutate({
        email,
        password,
        name: name || undefined,
        invitationToken,
      });
    }
  };

  if (pendingNotice) {
    return (
      <div className="space-y-4 w-full max-w-sm text-center">
        <h1 className="text-2xl tracking-tight text-[var(--color-star-100)]">
          Almost there
        </h1>
        <p className="text-sm text-[var(--color-star-300)]">
          Your account is created. The instance admin needs to approve it
          before you can sign in.
        </p>
        <p className="text-xs text-[var(--color-star-500)]">
          You can close this tab. We&apos;ll let you in once they&apos;ve clicked
          approve.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6 w-full max-w-sm">
      <header className="space-y-1 text-center">
        <h1 className="text-2xl tracking-tight text-[var(--color-star-100)]">
          {mode === "login" ? "Sign in" : "Create account"}
        </h1>
        {mode === "signup" && invitationToken && (
          <p className="text-xs text-[var(--color-nebula-cyan)] font-mono">
            Joining via invite link
          </p>
        )}
      </header>

      <div className="space-y-4">
        {mode === "signup" && (
          <Field label="Name (optional)">
            <Input
              type="text"
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              autoComplete="name"
              placeholder="Jane Doe"
            />
          </Field>
        )}
        <Field label="Email">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.currentTarget.value)}
            required
            autoComplete="email"
            placeholder="you@example.com"
          />
        </Field>
        <Field label="Password">
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
            required
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            placeholder={mode === "signup" ? "8+ characters" : ""}
          />
        </Field>
      </div>

      {error && (
        <p className="text-sm text-[var(--color-nebula-rose)]" role="alert">
          {error}
        </p>
      )}

      <Button
        type="submit"
        variant="primary"
        disabled={submitting}
        className="w-full"
      >
        {submitting ? "..." : mode === "login" ? "Sign in" : "Sign up"}
      </Button>

      <p className="text-center text-xs text-[var(--color-star-500)]">
        {mode === "login" ? (
          <>
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="text-[var(--color-star-300)] hover:text-[var(--color-star-100)]">
              Sign up
            </Link>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <Link href="/login" className="text-[var(--color-star-300)] hover:text-[var(--color-star-100)]">
              Sign in
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
