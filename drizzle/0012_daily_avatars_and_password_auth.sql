ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_hash" varchar(255);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "onboarding_completed" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "user_activity" ADD COLUMN IF NOT EXISTS "active_days_count" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "user_activity" ADD COLUMN IF NOT EXISTS "last_active_day" varchar(10);
--> statement-breakpoint
ALTER TABLE "user_activity" ALTER COLUMN "unlocked_avatars" SET DEFAULT '["av_01"]'::jsonb;
--> statement-breakpoint
UPDATE "user_activity"
SET
  "active_days_count" = GREATEST(1, COALESCE("active_days_count", 1)),
  "last_active_day" = COALESCE("last_active_day", to_char("last_visit_at" AT TIME ZONE 'Asia/Tashkent', 'YYYY-MM-DD')),
  "unlocked_avatars" = '["av_01"]'::jsonb
WHERE "last_active_day" IS NULL;
