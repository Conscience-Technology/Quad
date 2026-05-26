import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "~/lib/env";
import * as schema from "./schema";

declare global {
  // eslint-disable-next-line no-var
  var __quadPg: ReturnType<typeof postgres> | undefined;
}

const client =
  global.__quadPg ??
  postgres(env().DATABASE_URL, {
    max: 10,
    prepare: true,
    idle_timeout: 30,
  });

if (env().NODE_ENV !== "production") global.__quadPg = client;

export const db = drizzle(client, { schema, logger: env().NODE_ENV === "development" });

export type DB = typeof db;
export { schema };
