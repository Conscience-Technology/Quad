import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "~/db";
import { env } from "~/lib/env";
import { getOrCreateInstance } from "~/lib/instance";
import { hashPassword } from "~/lib/password";
import { readSession } from "./cookie";

export type CurrentUser = typeof schema.users.$inferSelect;

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await readSession();
  if (session) {
    const rows = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, session.userId))
      .limit(1);
    const user = rows[0];
    if (user && user.isActive) return user;
  }
  // In development, bypass login entirely by auto-provisioning + returning the
  // super-admin user. Never engages in production.
  if (env().NODE_ENV === "development") {
    return ensureDevSuperAdmin();
  }
  return null;
}

let cachedDevAdmin: CurrentUser | undefined;

async function ensureDevSuperAdmin(): Promise<CurrentUser> {
  if (cachedDevAdmin) return cachedDevAdmin;
  await getOrCreateInstance();
  const email = env().SUPER_ADMIN_EMAIL.toLowerCase().trim();
  const existing = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);
  if (existing[0]) {
    cachedDevAdmin = existing[0];
    return cachedDevAdmin;
  }
  const passwordHash = await hashPassword("dev-only-placeholder-not-used");
  const [created] = await db
    .insert(schema.users)
    .values({
      email,
      passwordHash,
      name: "Dev",
      isSuperAdmin: true,
      isActive: true,
    })
    .returning();
  if (!created) throw new Error("dev super admin insert failed");
  cachedDevAdmin = created;
  return created;
}
