/**
 * MCP key authentication. Reads `Authorization: Bearer qd_mcp_...`, verifies
 * sha256 hash + scope + expiry, returns the calling user + their allowed
 * project IDs.
 */
import { and, eq, gt, isNull, or } from "drizzle-orm";
import { db, schema } from "~/db";
import { hashApiKey } from "./api-key";

export type AuthedMcp = {
  user: typeof schema.users.$inferSelect;
  apiKey: typeof schema.apiKeys.$inferSelect;
  projectIds: string[];
};

export async function authMcpRequest(req: Request): Promise<
  | { ok: true; auth: AuthedMcp }
  | { ok: false; err: { status: number; error: string } }
> {
  const auth = req.headers.get("authorization");
  if (!auth || !auth.toLowerCase().startsWith("bearer ")) {
    return { ok: false, err: { status: 401, error: "missing bearer" } };
  }
  const key = auth.slice(7).trim();
  const hash = hashApiKey(key);

  const rows = await db
    .select()
    .from(schema.apiKeys)
    .where(
      and(
        eq(schema.apiKeys.keyHash, hash),
        eq(schema.apiKeys.scope, "mcp"),
        isNull(schema.apiKeys.revokedAt),
        or(isNull(schema.apiKeys.expiresAt), gt(schema.apiKeys.expiresAt, new Date())),
      ),
    )
    .limit(1);
  const apiKey = rows[0];
  if (!apiKey || !apiKey.userId) {
    return { ok: false, err: { status: 401, error: "invalid mcp key" } };
  }

  const userRows = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, apiKey.userId))
    .limit(1);
  const user = userRows[0];
  if (!user || user.status !== "active") {
    return { ok: false, err: { status: 401, error: "user inactive" } };
  }

  const links = await db
    .select({ projectId: schema.mcpKeyProjects.projectId })
    .from(schema.mcpKeyProjects)
    .where(eq(schema.mcpKeyProjects.apiKeyId, apiKey.id));

  void db
    .update(schema.apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(schema.apiKeys.id, apiKey.id));

  return {
    ok: true,
    auth: { user, apiKey, projectIds: links.map((l) => l.projectId) },
  };
}

export function projectAllowed(auth: AuthedMcp, projectId: string): boolean {
  if (auth.user.isSuperAdmin) return true;
  return auth.projectIds.includes(projectId);
}
