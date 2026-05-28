import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { schema } from "~/db";
import type { AzureDevOpsConfig } from "~/db/schema";
import { encryptSecret } from "~/lib/secret-box";
import {
  azureDevOpsProvider,
  AZURE_DEVOPS_PROVIDER_ID,
} from "~/server/integrations/azure-devops";
import { env } from "~/lib/env";
import { getUserIntegrationSecret } from "~/server/integrations/credentials";
import { authedProcedure, router } from "../trpc";

const Provider = AZURE_DEVOPS_PROVIDER_ID;

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

  testAzureDevOps: authedProcedure
    .input(
      z.object({
        organization: z.string().trim().min(1).max(120),
        project: z.string().trim().min(1).max(160),
        workItemId: z.number().int().positive().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const config: AzureDevOpsConfig = {
        enabled: true,
        organization: input.organization,
        project: input.project,
      };
      const userPat = await getUserIntegrationSecret(
        Provider,
        ctx.user.id,
        input.organization,
      );
      const serverPat = env().AZURE_DEVOPS_PAT;
      const credentials = userPat || serverPat;
      if (!azureDevOpsProvider.isConfigured(config, credentials)) {
        return {
          ok: false,
          credentialSource: "missing" as const,
          message: "Save a personal PAT or set AZURE_DEVOPS_PAT on the server.",
        };
      }

      if (input.workItemId) {
        const issue = await azureDevOpsProvider.getIssue({
          config,
          issueId: input.workItemId,
          credentials,
        });
        return {
          ok: true,
          credentialSource: userPat ? "user" as const : "server" as const,
          message: issue?.title
            ? `Connected. Found #${issue.id}: ${issue.title}`
            : `Connected. Found work item #${input.workItemId}.`,
          issue,
        };
      }

      const result = await azureDevOpsProvider.testConnection?.({
        config,
        credentials,
      });
      return {
        ok: true,
        credentialSource: userPat ? "user" as const : "server" as const,
        message: result?.message ?? "Connected.",
      };
    }),
});
