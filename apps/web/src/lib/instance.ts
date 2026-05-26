/**
 * Instance singleton. Quad is single-tenant per deployment, so there's exactly
 * one row in `instance` with id=1. Created on first call to `getOrCreateInstance`.
 */
import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "~/db";

export async function getOrCreateInstance() {
  const rows = await db
    .select()
    .from(schema.instance)
    .where(eq(schema.instance.id, 1))
    .limit(1);
  const existing = rows[0];
  if (existing) return existing;
  const [created] = await db
    .insert(schema.instance)
    .values({ id: 1, name: "Quad" })
    .onConflictDoNothing()
    .returning();
  if (created) return created;
  // Race: another request just created it. Read back.
  const refetch = await db
    .select()
    .from(schema.instance)
    .where(eq(schema.instance.id, 1))
    .limit(1);
  const row = refetch[0];
  if (!row) throw new Error("instance singleton missing after upsert race");
  return row;
}
