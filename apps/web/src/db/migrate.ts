/**
 * Apply Drizzle migrations from ./drizzle. Run on container startup and via
 * `pnpm db:migrate` in dev.
 */
import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const sql = postgres(url, { max: 1 });
const db = drizzle(sql);

console.log("Applying migrations…");
await migrate(db, { migrationsFolder: "./drizzle" });
console.log("Migrations applied.");
await sql.end();
