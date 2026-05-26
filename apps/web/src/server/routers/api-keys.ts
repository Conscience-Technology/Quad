/**
 * API keys router.
 *
 * Two scopes:
 *   - sdk: tied to a project. Browser-exposed; origin-checked at ingest time.
 *   - mcp: tied to a user. Plus a list of project IDs they can act on.
 *
 * Plain key is returned ONLY on `create`. After that the DB holds only the
 * sha256 hash + a short prefix for UI identification.
 */
import { TRPCError } from "@trpc/server";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { schema } from "~/db";
import { generateApiKey } from "~/lib/api-key";
import { projectAdminProcedure } from "../auth-procedures";
import { authedProcedure, router } from "../trpc";

const EnvSchema = z.enum(["development", "production"]).default("production");

export const apiKeysRouter = router({
  /** SDK keys for a project. Admin+. */
  listForProject: projectAdminProcedure.query(async ({ ctx, input }) => {
    return ctx.db
      .select({
        id: schema.apiKeys.id,
        prefix: schema.apiKeys.prefix,
        label: schema.apiKeys.label,
        env: schema.apiKeys.env,
        lastUsedAt: schema.apiKeys.lastUsedAt,
        revokedAt: schema.apiKeys.revokedAt,
        createdAt: schema.apiKeys.createdAt,
      })
      .from(schema.apiKeys)
      .where(
        and(
          eq(schema.apiKeys.scope, "sdk"),
          eq(schema.apiKeys.projectId, input.projectId),
        ),
      );
  }),

  createSdk: projectAdminProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        label: z.string().max(80).optional(),
        env: EnvSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { plain, prefix, hash } = generateApiKey("sdk");
      const [row] = await ctx.db
        .insert(schema.apiKeys)
        .values({
          scope: "sdk",
          env: input.env,
          keyHash: hash,
          prefix,
          label: input.label ?? null,
          projectId: input.projectId,
          createdByUserId: ctx.user.id,
        })
        .returning();
      await ctx.db.insert(schema.auditLog).values({
        whoKind: "user",
        whoId: ctx.user.id,
        action: "api_key.create",
        target: row?.id ?? "?",
        meta: { scope: "sdk", projectId: input.projectId, env: input.env },
      });
      return { id: row?.id, prefix, plain }; // plain shown ONCE
    }),

  /** MCP keys belong to the calling user. Available projects must include only
   * projects the user is an active member of. */
  listMine: authedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({
        id: schema.apiKeys.id,
        prefix: schema.apiKeys.prefix,
        label: schema.apiKeys.label,
        expiresAt: schema.apiKeys.expiresAt,
        lastUsedAt: schema.apiKeys.lastUsedAt,
        revokedAt: schema.apiKeys.revokedAt,
        createdAt: schema.apiKeys.createdAt,
      })
      .from(schema.apiKeys)
      .where(
        and(
          eq(schema.apiKeys.scope, "mcp"),
          eq(schema.apiKeys.userId, ctx.user.id),
        ),
      );
    return rows;
  }),

  createMcp: authedProcedure
    .input(
      z.object({
        label: z.string().max(80).optional(),
        projectIds: z.array(z.string().uuid()).min(1),
        expiresInDays: z.number().int().min(1).max(365).default(90),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Restrict project list to projects the user is an active member of.
      const memberships = await ctx.db
        .select({ projectId: schema.projectMembers.projectId })
        .from(schema.projectMembers)
        .where(
          and(
            eq(schema.projectMembers.userId, ctx.user.id),
            eq(schema.projectMembers.status, "active"),
          ),
        );
      const allowed = new Set(memberships.map((m) => m.projectId));
      const requested = ctx.user.isSuperAdmin
        ? input.projectIds
        : input.projectIds.filter((id) => allowed.has(id));
      if (requested.length === 0) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not a member of the selected projects",
        });
      }

      const { plain, prefix, hash } = generateApiKey("mcp");
      const expiresAt = new Date(Date.now() + input.expiresInDays * 86_400_000);

      const [row] = await ctx.db
        .insert(schema.apiKeys)
        .values({
          scope: "mcp",
          env: "production",
          keyHash: hash,
          prefix,
          label: input.label ?? null,
          userId: ctx.user.id,
          expiresAt,
          createdByUserId: ctx.user.id,
        })
        .returning();

      if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await ctx.db.insert(schema.mcpKeyProjects).values(
        requested.map((projectId) => ({ apiKeyId: row.id, projectId })),
      );

      await ctx.db.insert(schema.auditLog).values({
        whoKind: "user",
        whoId: ctx.user.id,
        action: "api_key.create",
        target: row.id,
        meta: { scope: "mcp", projectIds: requested, expiresAt: expiresAt.toISOString() },
      });

      return { id: row.id, prefix, plain, expiresAt };
    }),

  revoke: authedProcedure
    .input(z.object({ apiKeyId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select()
        .from(schema.apiKeys)
        .where(eq(schema.apiKeys.id, input.apiKeyId))
        .limit(1);
      const key = rows[0];
      if (!key) throw new TRPCError({ code: "NOT_FOUND" });
      // Authorization: super admin always. Otherwise: must own the key (mcp)
      // OR be an admin of the project (sdk).
      let allowed = ctx.user.isSuperAdmin;
      if (!allowed && key.scope === "mcp" && key.userId === ctx.user.id) {
        allowed = true;
      }
      if (!allowed && key.scope === "sdk" && key.projectId) {
        const m = await ctx.db
          .select({ role: schema.projectMembers.role })
          .from(schema.projectMembers)
          .where(
            and(
              eq(schema.projectMembers.projectId, key.projectId),
              eq(schema.projectMembers.userId, ctx.user.id),
              isNull(schema.apiKeys.revokedAt),
            ),
          )
          .limit(1);
        if (m[0] && (m[0].role === "owner" || m[0].role === "admin")) allowed = true;
      }
      if (!allowed) throw new TRPCError({ code: "FORBIDDEN" });

      await ctx.db
        .update(schema.apiKeys)
        .set({ revokedAt: new Date() })
        .where(eq(schema.apiKeys.id, input.apiKeyId));

      await ctx.db.insert(schema.auditLog).values({
        whoKind: "user",
        whoId: ctx.user.id,
        action: "api_key.revoke",
        target: input.apiKeyId,
        meta: { scope: key.scope },
      });

      return { ok: true };
    }),
});
