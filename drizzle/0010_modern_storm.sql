CREATE TABLE "telegram_init_data_replays" (
	"init_data_hash" char(64) PRIMARY KEY NOT NULL,
	"telegram_user_id" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_tg_replays_expires" ON "telegram_init_data_replays" USING btree ("expires_at");