/**
 * Instance router — settings managed by Super Admin only.
 */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { schema } from "~/db";
import { getOrCreateInstance } from "~/lib/instance";
import { authedProcedure, router, superAdminProcedure } from "../trpc";

export const instanceRouter = router({
  /** Public-ish: anyone signed in can read non-sensitive instance info. */
  info: authedProcedure.query(async () => {
    const inst = await getOrCreateInstance();
    return {
      name: inst.name,
      sttEnabled: !!inst.openaiApiKeyEncrypted,
    };
  }),

  update: superAdminProcedure
    .input(
      z.object({
        name: z.string().min(1).max(64).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await getOrCreateInstance();
      const [updated] = await ctx.db
        .update(schema.instance)
        .set({
          ...(input.name !== undefined ? { name: input.name } : {}),
          updatedAt: new Date(),
        })
        .where(eq(schema.instance.id, 1))
        .returning();
      await ctx.db.insert(schema.auditLog).values({
        whoKind: "super_admin",
        whoId: ctx.user.id,
        action: "instance.update",
        target: "instance",
        meta: input,
      });
      return updated;
    }),
});
