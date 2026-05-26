/**
 * Project members router: list, invite (creates invitation token), join
 * request, approve, reject, change role, remove.
 *
 * Invitation tokens: 32 bytes random base64url. URL: /signup?invite=<token>.
 * Stored as sha256(token). Expires in 14 days. Signup consumes them.
 */
import { createHash, randomBytes } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { schema } from "~/db";
import { sendEmail, inviteEmail } from "~/lib/email";
import { env, features } from "~/lib/env";
import { projectAdminProcedure, projectMemberProcedure } from "../auth-procedures";
import { authedProcedure, router } from "../trpc";

const RoleSchema = z.enum(["owner", "admin", "member"]);

const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

export const membersRouter = router({
  list: projectMemberProcedure.query(async ({ ctx, input }) => {
    return ctx.db
      .select({
        userId: schema.projectMembers.userId,
        email: schema.users.email,
        name: schema.users.name,
        role: schema.projectMembers.role,
        status: schema.projectMembers.status,
        joinedAt: schema.projectMembers.joinedAt,
      })
      .from(schema.projectMembers)
      .innerJoin(schema.users, eq(schema.users.id, schema.projectMembers.userId))
      .where(eq(schema.projectMembers.projectId, input.projectId));
  }),

  invite: projectAdminProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        email: z.string().email().toLowerCase(),
        role: RoleSchema.default("member"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // If the user already exists, upsert membership as pending; otherwise
      // create an invitation row to be redeemed on signup.
      const userRows = await ctx.db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.email, input.email))
        .limit(1);

      if (userRows[0]) {
        const userId = userRows[0].id;
        await ctx.db
          .insert(schema.projectMembers)
          .values({
            projectId: input.projectId,
            userId,
            role: input.role,
            status: "active",
            invitedByUserId: ctx.user.id,
            joinedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [schema.projectMembers.projectId, schema.projectMembers.userId],
            set: { role: input.role, status: "active", joinedAt: new Date() },
          });
        await ctx.db.insert(schema.auditLog).values({
          whoKind: "user",
          whoId: ctx.user.id,
          action: "member.add_existing",
          target: input.projectId,
          meta: { email: input.email, role: input.role },
        });
        return { kind: "added" as const };
      }

      const token = randomBytes(32).toString("base64url");
      await ctx.db.insert(schema.invitations).values({
        projectId: input.projectId,
        email: input.email,
        role: input.role,
        tokenHash: hashToken(token),
        invitedByUserId: ctx.user.id,
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      });
      // Fetch project name + inviter name for the email template.
      const [project] = await ctx.db
        .select({ name: schema.projects.name })
        .from(schema.projects)
        .where(eq(schema.projects.id, input.projectId))
        .limit(1);
      const inviteUrl = `${env().APP_URL}/signup?invite=${encodeURIComponent(token)}`;

      let emailSent = false;
      if (features.email()) {
        const tpl = inviteEmail({
          projectName: project?.name ?? "a Quad project",
          inviteUrl,
          invitedBy: ctx.user.name ?? ctx.user.email,
        });
        const res = await sendEmail({
          to: input.email,
          subject: tpl.subject,
          html: tpl.html,
        });
        emailSent = res.ok;
      }

      await ctx.db.insert(schema.auditLog).values({
        whoKind: "user",
        whoId: ctx.user.id,
        action: "member.invite",
        target: input.projectId,
        meta: { email: input.email, role: input.role, emailSent },
      });
      // Always return the token too — admin can copy the URL if email is
      // disabled or didn't reach the inbox.
      return { kind: "invited" as const, inviteToken: token, emailSent };
    }),

  /** Active user requests to join an existing project by id. */
  requestJoin: authedProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .insert(schema.projectMembers)
        .values({
          projectId: input.projectId,
          userId: ctx.user.id,
          role: "member",
          status: "pending",
        })
        .onConflictDoNothing();
      await ctx.db.insert(schema.auditLog).values({
        whoKind: "user",
        whoId: ctx.user.id,
        action: "member.join_request",
        target: input.projectId,
      });
      return { ok: true };
    }),

  approve: projectAdminProcedure
    .input(z.object({ projectId: z.string().uuid(), userId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(schema.projectMembers)
        .set({ status: "active", joinedAt: new Date() })
        .where(
          and(
            eq(schema.projectMembers.projectId, input.projectId),
            eq(schema.projectMembers.userId, input.userId),
          ),
        );
      await ctx.db.insert(schema.auditLog).values({
        whoKind: "user",
        whoId: ctx.user.id,
        action: "member.approve",
        target: input.projectId,
        meta: { userId: input.userId },
      });
      return { ok: true };
    }),

  reject: projectAdminProcedure
    .input(z.object({ projectId: z.string().uuid(), userId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(schema.projectMembers)
        .where(
          and(
            eq(schema.projectMembers.projectId, input.projectId),
            eq(schema.projectMembers.userId, input.userId),
            eq(schema.projectMembers.status, "pending"),
          ),
        );
      await ctx.db.insert(schema.auditLog).values({
        whoKind: "user",
        whoId: ctx.user.id,
        action: "member.reject",
        target: input.projectId,
        meta: { userId: input.userId },
      });
      return { ok: true };
    }),

  changeRole: projectAdminProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        userId: z.string().uuid(),
        role: RoleSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Only owners may change other owners' role (handled by a soft check
      // here; project owner procedure handles the symmetric case below).
      const target = await ctx.db
        .select({ role: schema.projectMembers.role })
        .from(schema.projectMembers)
        .where(
          and(
            eq(schema.projectMembers.projectId, input.projectId),
            eq(schema.projectMembers.userId, input.userId),
          ),
        )
        .limit(1);
      if (target[0]?.role === "owner" && ctx.membership.role !== "owner") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only an owner can change another owner's role" });
      }
      await ctx.db
        .update(schema.projectMembers)
        .set({ role: input.role })
        .where(
          and(
            eq(schema.projectMembers.projectId, input.projectId),
            eq(schema.projectMembers.userId, input.userId),
          ),
        );
      await ctx.db.insert(schema.auditLog).values({
        whoKind: "user",
        whoId: ctx.user.id,
        action: "member.role_change",
        target: input.projectId,
        meta: { userId: input.userId, role: input.role },
      });
      return { ok: true };
    }),

  remove: projectAdminProcedure
    .input(z.object({ projectId: z.string().uuid(), userId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.user.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Use a different flow to leave the project yourself" });
      }
      await ctx.db
        .delete(schema.projectMembers)
        .where(
          and(
            eq(schema.projectMembers.projectId, input.projectId),
            eq(schema.projectMembers.userId, input.userId),
          ),
        );
      await ctx.db.insert(schema.auditLog).values({
        whoKind: "user",
        whoId: ctx.user.id,
        action: "member.remove",
        target: input.projectId,
        meta: { userId: input.userId },
      });
      return { ok: true };
    }),
});

export const invitationsLib = {
  hashToken,
  TTL_MS: INVITE_TTL_MS,
};
