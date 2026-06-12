ALTER TABLE "bug_reports" ADD COLUMN "feedback_type" text;--> statement-breakpoint
ALTER TABLE "bug_reports" ADD COLUMN "feedback_feature" text;--> statement-breakpoint
ALTER TABLE "bug_reports" ADD COLUMN "feedback_user_story" text;--> statement-breakpoint
ALTER TABLE "bug_reports" ADD COLUMN "feedback_location" text;--> statement-breakpoint
ALTER TABLE "bug_reports" ADD COLUMN "feedback_current_spec" text;--> statement-breakpoint
ALTER TABLE "bug_reports" ADD COLUMN "feedback_intended_spec" text;--> statement-breakpoint
ALTER TABLE "bug_reports" ADD COLUMN "feedback_reported_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bug_reports" ADD COLUMN "feedback_reporter" text;--> statement-breakpoint
ALTER TABLE "bug_reports" ADD COLUMN "feedback_comment" text;--> statement-breakpoint
UPDATE "bug_reports"
SET
  "feedback_type" = CASE
    WHEN "kind" = 'pin' THEN 'UI 위치 제보'
    WHEN "kind" = 'capture' THEN '녹화 제보'
    ELSE '일반 제보'
  END,
  "feedback_location" = NULLIF(
    concat_ws(
      E'\n',
      CASE WHEN "target_route" IS NOT NULL THEN 'Route: ' || "target_route" END,
      CASE WHEN "target_selector" IS NOT NULL THEN 'Selector: ' || "target_selector" END,
      CASE WHEN "target_component_path" IS NOT NULL THEN 'Component: ' || "target_component_path" END,
      CASE WHEN "page_url" IS NOT NULL THEN 'URL: ' || "page_url" END
    ),
    ''
  ),
  "feedback_current_spec" = NULLIF(
    concat_ws(E'\n\n', NULLIF("title", ''), NULLIF("body", '')),
    ''
  ),
  "feedback_reported_at" = "created_at",
  "feedback_reporter" = COALESCE(
    "reporter_identify"->>'name',
    "reporter_identify"->>'email',
    "reporter_identify"->>'id',
    "reporter_anon_key"
  )
WHERE "feedback_current_spec" IS NULL;
