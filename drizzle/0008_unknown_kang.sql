ALTER TYPE "public"."user_role" ADD VALUE 'super_admin';--> statement-breakpoint
CREATE TABLE "admin_user_permissions" (
	"user_id" uuid NOT NULL,
	"permission_code" varchar(64) NOT NULL,
	"granted_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_user_permissions_user_id_permission_code_pk" PRIMARY KEY("user_id","permission_code")
);
--> statement-breakpoint
CREATE TABLE "moderation_appeals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"action_type" varchar(24) NOT NULL,
	"reason" varchar(500) NOT NULL,
	"status" varchar(24) DEFAULT 'pending' NOT NULL,
	"reviewed_by" uuid,
	"review_reason" varchar(300),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "moderation_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content_type" varchar(16) NOT NULL,
	"content_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"severity" varchar(16) NOT NULL,
	"reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"excerpt" varchar(280) NOT NULL,
	"status" varchar(24) DEFAULT 'open' NOT NULL,
	"reviewed_by" uuid,
	"decision_reason" varchar(300),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "platform_announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(100) NOT NULL,
	"body" varchar(500) NOT NULL,
	"created_by" uuid NOT NULL,
	"delivered_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_warnings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"issued_by" uuid NOT NULL,
	"report_id" uuid,
	"reason" varchar(300) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_settings" ALTER COLUMN "telegram_notifications" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "comment_reports" ALTER COLUMN "status" SET DATA TYPE varchar(24);--> statement-breakpoint
ALTER TABLE "comment_reports" ALTER COLUMN "status" SET DEFAULT 'open';--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "telegram_bot_started" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "telegram_chat_id" varchar(64);--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "notification_preferences" jsonb DEFAULT '{"like":true,"comment":true,"reply":true,"follow":true,"mention":true,"dm":true,"avatar_unlocked":true,"announcement":true}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "comment_reports" ADD COLUMN "reviewed_by" uuid;--> statement-breakpoint
ALTER TABLE "comment_reports" ADD COLUMN "resolution_reason" varchar(300);--> statement-breakpoint
ALTER TABLE "comment_reports" ADD COLUMN "resolved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "admin_user_permissions" ADD CONSTRAINT "admin_user_permissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_user_permissions" ADD CONSTRAINT "admin_user_permissions_permission_code_permissions_code_fk" FOREIGN KEY ("permission_code") REFERENCES "public"."permissions"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_user_permissions" ADD CONSTRAINT "admin_user_permissions_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_appeals" ADD CONSTRAINT "moderation_appeals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_appeals" ADD CONSTRAINT "moderation_appeals_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_flags" ADD CONSTRAINT "moderation_flags_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_flags" ADD CONSTRAINT "moderation_flags_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_announcements" ADD CONSTRAINT "platform_announcements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_warnings" ADD CONSTRAINT "user_warnings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_warnings" ADD CONSTRAINT "user_warnings_issued_by_users_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_moderation_appeals_status_created" ON "moderation_appeals" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "idx_moderation_appeals_user" ON "moderation_appeals" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_moderation_flags_status_created" ON "moderation_flags" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "idx_user_warnings_user_created" ON "user_warnings" USING btree ("user_id","created_at");--> statement-breakpoint
ALTER TABLE "comment_reports" ADD CONSTRAINT "comment_reports_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;