ALTER TYPE "public"."privacy_level" ADD VALUE 'private' BEFORE 'followers_only';--> statement-breakpoint
CREATE TABLE "user_activity" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"last_visit_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_post_at" timestamp with time zone,
	"last_qualified_at" timestamp with time zone,
	"active_three_day_cycles" integer DEFAULT 0 NOT NULL,
	"total_visits_count" integer DEFAULT 1 NOT NULL,
	"unlocked_avatars" jsonb DEFAULT '["av_01","av_02","av_03","av_04","av_05","av_06","av_07","av_08"]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "follow_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requester_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_follow_requests_no_self" CHECK ("follow_requests"."requester_id" <> "follow_requests"."target_id")
);
--> statement-breakpoint
ALTER TABLE "profiles" DROP CONSTRAINT "chk_profiles_username_format";--> statement-breakpoint
ALTER TABLE "profiles" ALTER COLUMN "display_name" SET DATA TYPE varchar(40);--> statement-breakpoint
ALTER TABLE "profiles" ALTER COLUMN "bio" SET DATA TYPE varchar(150);--> statement-breakpoint
ALTER TABLE "profiles" ALTER COLUMN "bio" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "avatar_id" varchar(16) DEFAULT 'av_01' NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "external_links" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "auto_approve_follows" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "show_online_status" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user_activity" ADD CONSTRAINT "user_activity_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_requests" ADD CONSTRAINT "follow_requests_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_requests" ADD CONSTRAINT "follow_requests_target_id_users_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_follow_requests_pair" ON "follow_requests" USING btree ("requester_id","target_id");--> statement-breakpoint
CREATE INDEX "idx_follow_requests_target_status" ON "follow_requests" USING btree ("target_id","status");--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "chk_profiles_username_format" CHECK ("profiles"."username" ~ '^[a-z0-9._]{5,20}$' AND "profiles"."username" !~ '(^\.|\.$|\.\.)');