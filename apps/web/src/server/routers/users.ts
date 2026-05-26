/**
 * Users router — instance-level user administration. Super admin only.
 *
 * Quad runs without email. New signups land in status='pending' and only
 * the super admin can flip them to 'active' (or 'suspended' / reject).
 */
import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { schema } from "~/db";
import { router, superAdminProcedure } from "../trpc";

export const usersRouter = router({
  list: superAdminProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        name: schema.users.name,
        isSuperAdmin: schema.users.isSuperAdmin,
        status: schema.users.status,
        approvedAt: schema.users.approvedAt,
        lastLoginAt: schema.users.lastLoginAt,
        createdAt: schema.users.createdAt,
      })
      .from(schema.users)
      .orderBy(desc(schema.users.createdAt))
      .limit(500);
  }),

  approve: superAdminProcedure
    .input(z.object({ userId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [user] = await ctx.db
        .update(schema.users)
        .set({
          status: "active",
          approvedAt: new Date(),
          approvedByUserId: ctx.user.id,
          updatedAt: new Date(),
        })
        .where(eq(schema.users.id, input.userId))
        .returning();
      if (!user) throw new TRPCError({ code: "NOT_FOUND" });
      await ctx.db.insert(schema.auditLog).values({
        whoKind: "super_admin",
        whoId: ctx.user.id,
        action: "user.approve",
        target: user.id,
        meta: { email: user.email },
      });
      return { ok: true as const };
    }),

  suspend: superAdminProcedure
    .input(z.object({ userId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.user.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot suspend yourself" });
      }
      const [user] = await ctx.db
        .update(schema.users)
        .set({ status: "suspended", updatedAt: new Date() })
        .where(eq(schema.users.id, input.userId))
        .returning();
      if (!user) throw new TRPCError({ code: "NOT_FOUND" });
      await ctx.db.insert(schema.auditLog).values({
        whoKind: "super_admin",
        whoId: ctx.user.id,
        action: "user.suspend",
        target: user.id,
        meta: { email: user.email },
      });
      return { ok: true as const };
    }),

  reject: superAdminProcedure
    .input(z.object({ userId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [user] = await ctx.db
        .select({ email: schema.users.email, status: schema.users.status })
        .from(schema.users)
        .where(eq(schema.users.id, input.userId))
        .limit(1);
      if (!user) throw new TRPCError({ code: "NOT_FOUND" });
      if (user.status !== "pending") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only pending users can be rejected — suspend instead",
        });
      }
      await ctx.db.delete(schema.users).where(eq(schema.users.id, input.userId));
      await ctx.db.insert(schema.auditLog).values({
        whoKind: "super_admin",
        whoId: ctx.user.id,
        action: "user.reject",
        target: input.userId,
        meta: { email: user.email },
      });
      return { ok: true as const };
    }),
});
