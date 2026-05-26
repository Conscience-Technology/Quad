import { UsersAdminPanel } from "./users-admin-panel";

export const dynamic = "force-dynamic";

export default function AdminUsers() {
  return (
    <div className="max-w-3xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl tracking-tight">Users</h1>
        <p className="text-sm text-[var(--color-star-500)]">
          New sign-ups land in <span className="font-mono">pending</span>.
          Approve them to let them sign in.
        </p>
      </header>
      <UsersAdminPanel />
    </div>
  );
}
