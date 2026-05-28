CREATE TABLE IF NOT EXISTS "project_integrations" (
	"project_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_integrations_project_id_provider_pk" PRIMARY KEY("project_id","provider")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_integrations" ADD CONSTRAINT "project_integrations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_integrations_provider_idx" ON "project_integrations" USING btree ("provider");
--> statement-breakpoint
INSERT INTO "project_integrations" ("project_id", "provider", "enabled", "config", "created_at", "updated_at")
SELECT
	"id",
	'azure-devops',
	COALESCE(("azure_devops"->>'enabled')::boolean, false),
	"azure_devops",
	now(),
	now()
FROM "projects"
WHERE "azure_devops" IS NOT NULL
ON CONFLICT ("project_id", "provider") DO UPDATE SET
	"enabled" = EXCLUDED."enabled",
	"config" = EXCLUDED."config",
	"updated_at" = now();
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "task_external_issues" (
	"task_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"external_id" text NOT NULL,
	"external_url" text,
	"title" text,
	"state" text,
	"sync_status" text DEFAULT 'unknown' NOT NULL,
	"sync_error" text,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_external_issues_task_id_provider_pk" PRIMARY KEY("task_id","provider")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "task_external_issues" ADD CONSTRAINT "task_external_issues_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_external_issues_provider_external_idx" ON "task_external_issues" USING btree ("provider","external_id");
--> statement-breakpoint
INSERT INTO "task_external_issues" ("task_id", "provider", "external_id", "external_url", "sync_status", "created_at", "updated_at")
SELECT
	"id",
	'azure-devops',
	"azure_work_item_id"::text,
	"azure_work_item_url",
	'unknown',
	now(),
	now()
FROM "tasks"
WHERE "azure_work_item_id" IS NOT NULL
ON CONFLICT ("task_id", "provider") DO UPDATE SET
	"external_id" = EXCLUDED."external_id",
	"external_url" = EXCLUDED."external_url",
	"updated_at" = now();
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "claimed_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "lease_expires_at" timestamp with time zone;
