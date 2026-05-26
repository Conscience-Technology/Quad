import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthForm } from "~/components/auth-form";
import { getCurrentUser } from "~/lib/auth/current-user";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(user.isSuperAdmin ? "/admin" : "/");
  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <Suspense>
        <AuthForm mode="login" />
      </Suspense>
    </main>
  );
}
