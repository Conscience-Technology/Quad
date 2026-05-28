import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { schema } from "~/db";
import { encryptSecret } from "~/lib/secret-box";
import { authedProcedure, router } from "../trpc";

const Provider = "azure-devops";

export const integrationsRouter = router({
  listMine: authedProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select({
        id: schema.userIntegrations.id,
        provider: schema.userIntegrations.provider,
        organization: schema.userIntegrations.organization,
        secretPrefix: schema.userIntegrations.secretPrefix,
        createdAt: schema.userIntegrations.createdAt,
        updatedAt: schema.userIntegrations.updatedAt,
      })
      .from(schema.userIntegrations)
      .where(
        and(
          eq(schema.userIntegrations.userId, ctx.user.id),
          eq(schema.userIntegrations.provider, Provider),
        ),
      );
  }),

  saveAzureDevOpsPat: authedProcedure
    .input(
      z.object({
        organization: z.string().trim().min(1).max(120),
        pat: z.string().trim().min(20).max(512),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const prefix = input.pat.slice(0, 6);
      const encrypted = encryptSecret(input.pat);
      await ctx.db
        .insert(schema.userIntegrations)
        .values({
          userId: ctx.user.id,
          provider: Provider,
          organization: input.organization,
          secretEncrypted: encrypted,
          secretPrefix: prefix,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [
            schema.userIntegrations.userId,
            schema.userIntegrations.provider,
            schema.userIntegrations.organization,
          ],
          set: {
            secretEncrypted: encrypted,
            secretPrefix: prefix,
            updatedAt: new Date(),
          },
        });

      await ctx.db.insert(schema.auditLog).values({
        whoKind: "user",
        whoId: ctx.user.id,
        action: "integration.azure_devops_pat.save",
        target: input.organization,
      });
      return { ok: true };
    }),

  deleteAzureDevOpsPat: authedProcedure
    .input(z.object({ organization: z.string().trim().min(1).max(120) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(schema.userIntegrations)
        .where(
          and(
            eq(schema.userIntegrations.userId, ctx.user.id),
            eq(schema.userIntegrations.provider, Provider),
            eq(schema.userIntegrations.organization, input.organization),
          ),
        );
      await ctx.db.insert(schema.auditLog).values({
        whoKind: "user",
        whoId: ctx.user.id,
        action: "integration.azure_devops_pat.delete",
        target: input.organization,
      });
      return { ok: true };
    }),
});
