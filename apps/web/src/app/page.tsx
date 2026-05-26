import Link from "next/link";
import { redirect } from "next/navigation";
import { BrandMark } from "~/components/ui";
import { getCurrentUser } from "~/lib/auth/current-user";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getCurrentUser();
  if (user?.isSuperAdmin) redirect("/admin");
  if (user) redirect("/projects");

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-xl space-y-8 text-center">
        <BrandMark size={36} className="text-star-500 mx-auto" />

        <h1 className="text-4xl font-semibold tracking-tight text-star-100">Quad</h1>

        <p className="text-star-300">
          The bug reporter that ships its reporter&apos;s video, audio, DOM,
          <br />
          and network context straight to your AI coding agent.
        </p>

        <div className="flex items-center justify-center gap-3 pt-4">
          <Link
            href="/login"
            className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-md bg-nebula-violet text-space-void hover:opacity-90 transition-opacity"
            style={{ transitionTimingFunction: "var(--ease-cosmos)", transitionDuration: "160ms" }}
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className="inline-flex items-center px-4 py-2 text-sm text-star-300 hover:text-star-100 transition-colors"
            style={{ transitionTimingFunction: "var(--ease-cosmos)", transitionDuration: "160ms" }}
          >
            Create account
          </Link>
        </div>

        <p className="pt-12 text-xs text-star-500 font-mono">
          MIT · self-hosted · v0.0.0
        </p>
      </div>
    </main>
  );
}
