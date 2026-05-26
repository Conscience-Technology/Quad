import { eq } from "drizzle-orm";
import { db, schema } from "~/db";

export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "project";
}

export async function uniqueProjectSlug(base: string): Promise<string> {
  const root = slugify(base);
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? root : `${root}-${i + 1}`;
    const taken = await db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(eq(schema.projects.slug, candidate))
      .limit(1);
    if (taken.length === 0) return candidate;
  }
  // Extremely unlikely: append a random suffix.
  return `${root}-${crypto.randomUUID().slice(0, 6)}`;
}
