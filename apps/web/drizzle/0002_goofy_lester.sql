UPDATE "users" SET "status" = 'active' WHERE "is_active" = true;--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN IF EXISTS "is_active";