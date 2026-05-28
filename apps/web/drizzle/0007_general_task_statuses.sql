ALTER TABLE "tasks" ALTER COLUMN "status" DROP DEFAULT;
--> statement-breakpoint
CREATE TYPE "public"."task_status_new" AS ENUM(
	'to_do',
	'in_progress',
	'reviewed',
	'resolved',
	'published',
	'done',
	'canceled'
);
--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "status" TYPE "public"."task_status_new" USING (
	CASE "status"::text
		WHEN 'queued' THEN 'to_do'
		WHEN 'picked' THEN 'in_progress'
		WHEN 'in_progress' THEN 'in_progress'
		WHEN 'pr_open' THEN 'reviewed'
		WHEN 'done' THEN 'done'
		WHEN 'wont_do' THEN 'canceled'
		ELSE 'to_do'
	END
)::"public"."task_status_new";
--> statement-breakpoint
DROP TYPE "public"."task_status";
--> statement-breakpoint
ALTER TYPE "public"."task_status_new" RENAME TO "task_status";
--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "status" SET DEFAULT 'to_do';
--> statement-breakpoint
UPDATE "projects"
SET "azure_devops" = jsonb_set(
	"azure_devops",
	'{stateMap}',
	jsonb_strip_nulls(jsonb_build_object(
		'to_do', COALESCE("azure_devops"#>>'{stateMap,to_do}', "azure_devops"#>>'{stateMap,queued}'),
		'in_progress', COALESCE("azure_devops"#>>'{stateMap,in_progress}', "azure_devops"#>>'{stateMap,picked}'),
		'reviewed', COALESCE("azure_devops"#>>'{stateMap,reviewed}', "azure_devops"#>>'{stateMap,pr_open}'),
		'resolved', COALESCE("azure_devops"#>>'{stateMap,resolved}', 'Resolved'),
		'published', COALESCE("azure_devops"#>>'{stateMap,published}', 'Published'),
		'done', "azure_devops"#>>'{stateMap,done}',
		'canceled', COALESCE("azure_devops"#>>'{stateMap,canceled}', "azure_devops"#>>'{stateMap,wont_do}')
	)),
	true
)
WHERE "azure_devops" IS NOT NULL;
--> statement-breakpoint
UPDATE "project_integrations"
SET
	"config" = jsonb_set(
		"config",
		'{stateMap}',
		jsonb_strip_nulls(jsonb_build_object(
			'to_do', COALESCE("config"#>>'{stateMap,to_do}', "config"#>>'{stateMap,queued}'),
			'in_progress', COALESCE("config"#>>'{stateMap,in_progress}', "config"#>>'{stateMap,picked}'),
			'reviewed', COALESCE("config"#>>'{stateMap,reviewed}', "config"#>>'{stateMap,pr_open}'),
			'resolved', COALESCE("config"#>>'{stateMap,resolved}', 'Resolved'),
			'published', COALESCE("config"#>>'{stateMap,published}', 'Published'),
			'done', "config"#>>'{stateMap,done}',
			'canceled', COALESCE("config"#>>'{stateMap,canceled}', "config"#>>'{stateMap,wont_do}')
		)),
		true
	),
	"updated_at" = now()
WHERE "provider" = 'azure-devops';
