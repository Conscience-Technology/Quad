CREATE TABLE IF NOT EXISTS "sdk_reporter_integrations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"organization" text NOT NULL,
	"reporter_anon_key" text NOT NULL,
	"secret_encrypted" text NOT NULL,
	"secret_prefix" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sdk_reporter_integrations" ADD CONSTRAINT "sdk_reporter_integrations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sdk_reporter_integrations_reporter_provider_org_uq" ON "sdk_reporter_integrations" USING btree ("project_id","provider","organization","reporter_anon_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sdk_reporter_integrations_project_provider_idx" ON "sdk_reporter_integrations" USING btree ("project_id","provider");
