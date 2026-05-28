ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "azure_devops" jsonb;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "azure_work_item_id" integer;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "azure_work_item_url" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_azure_work_item_idx" ON "tasks" USING btree ("project_id","azure_work_item_id");
