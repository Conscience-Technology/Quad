/**
 * Auth router: signup, login, logout, me.
 *
 * Self-hosted invariants enforced here:
 *  - First-boot user matching SUPER_ADMIN_EMAIL is promoted automatically.
 *  - With INSTANCE_SIGNUP_OPEN=false, signup is restricted to the super admin
 *    email and accepted invitation tokens (invitation token flow lands in the
 *    member router).
 */
import { TRPCError } from "@trpc/server";
import { and, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";
import { schema } from "~/db";
import { clearSessionCookie, setSessionCookie } from "~/lib/auth/cookie";
import { env } from "~/lib/env";
import { getOrCreateInstance } from "~/lib/instance";
import { hashPassword, validatePassword, verifyPassword } from "~/lib/password";
import { authedProcedure, publicProcedure, router } from "../trpc";
import { invitationsLib } from "./members";

const EmailSchema = z.string().email().toLowerCase().trim();
const PasswordSchema = z.string().min(12).max(256);
const NameSchema = z.string().min(1).max(100).optional();

export const authRouter = router({
  /** Returns the current user (null if not signed in). */
  me: publicProcedure.query(({ ctx }) => ctx.user),

  signup: publicProcedure
    .input(
      z.object({
        email: EmailSchema,
        password: PasswordSchema,
        name: NameSchema,
        invitationToken: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await getOrCreateInstance();

      const passCheck = validatePassword(input.password);
      if (!passCheck.ok) {
        throw new TRPCError({ code: "BAD_REQUEST", message: passCheck.reason });
      }

      const superAdminEmail = env().SUPER_ADMIN_EMAIL.toLowerCase().trim();
      const isSuperAdmin = input.email === superAdminEmail;

      if (!isSuperAdmin && !env().INSTANCE_SIGNUP_OPEN && !input.invitationToken) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Public signup is closed on this instance. An invitation is required.",
        });
      }

      const existing = await ctx.db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.email, input.email))
        .limit(1);
      if (existing.length > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Email already in use",
        });
      }

      const passwordHash = await hashPassword(input.password);
      const [user] = await ctx.db
        .insert(schema.users)
        .values({
          email: input.email,
          passwordHash,
          name: input.name ?? null,
          isSuperAdmin,
        })
        .returning();
      if (!user) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Consume invitation token: if a matching, unexpired,
      // unaccepted invitation exists for this email, upsert membership as active.
      if (input.invitationToken) {
        const tokenHash = invitationsLib.hashToken(input.invitationToken);
        const invRows = await ctx.db
          .select()
          .from(schema.invitations)
          .where(
            and(
              eq(schema.invitations.tokenHash, tokenHash),
              eq(schema.invitations.email, input.email),
              isNull(schema.invitations.acceptedAt),
              gt(schema.invitations.expiresAt, new Date()),
            ),
          )
          .limit(1);
        const inv = invRows[0];
        if (inv) {
          await ctx.db.insert(schema.projectMembers).values({
            projectId: inv.projectId,
            userId: user.id,
            role: inv.role,
            status: "active",
            invitedByUserId: inv.invitedByUserId,
            joinedAt: new Date(),
          });
          await ctx.db
            .update(schema.invitations)
            .set({ acceptedAt: new Date() })
            .where(eq(schema.invitations.id, inv.id));
        }
      }

      await setSessionCookie(user.id);
      await ctx.db.insert(schema.auditLog).values({
        whoKind: "user",
        whoId: user.id,
        action: "signup",
        target: user.id,
        meta: { isSuperAdmin, viaInvite: !!input.invitationToken },
      });

      return { id: user.id, email: user.email, isSuperAdmin: user.isSuperAdmin };
    }),

  login: publicProcedure
    .input(z.object({ email: EmailSchema, password: PasswordSchema }))
    .mutation(async ({ ctx, input }) => {
      await getOrCreateInstance();

      const rows = await ctx.db
        .select()
        .from(schema.users)
        .where(eq(schema.users.email, input.email))
        .limit(1);
      const user = rows[0];
      if (!user || !user.isActive) {
        // Same response shape on missing / inactive / wrong pw -> harder to enumerate.
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid email or password",
        });
      }
      const ok = await verifyPassword(input.password, user.passwordHash);
      if (!ok) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid email or password",
        });
      }

      await ctx.db
        .update(schema.users)
        .set({ lastLoginAt: new Date() })
        .where(eq(schema.users.id, user.id));

      await setSessionCookie(user.id);
      await ctx.db.insert(schema.auditLog).values({
        whoKind: "user",
        whoId: user.id,
        action: "login",
        target: user.id,
      });

      return {
        id: user.id,
        email: user.email,
        isSuperAdmin: user.isSuperAdmin,
      };
    }),

  logout: authedProcedure.mutation(async ({ ctx }) => {
    await clearSessionCookie();
    await ctx.db.insert(schema.auditLog).values({
      whoKind: "user",
      whoId: ctx.user.id,
      action: "logout",
      target: ctx.user.id,
    });
    return { ok: true };
  }),
});
