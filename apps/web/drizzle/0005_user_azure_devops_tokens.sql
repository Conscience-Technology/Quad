CREATE TABLE IF NOT EXISTS "user_integrations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"organization" text NOT NULL,
	"secret_encrypted" text NOT NULL,
	"secret_prefix" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_integrations" ADD CONSTRAINT "user_integrations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_integrations_user_provider_org_uq" ON "user_integrations" USING btree ("user_id","provider","organization");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_integrations_user_provider_idx" ON "user_integrations" USING btree ("user_id","provider");
