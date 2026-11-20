-- Custom SQL migration: Telegram initData Replay Protection RLS

ALTER TABLE "telegram_init_data_replays" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "telegram_init_data_replays" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tg_replays_auth_flow" ON "telegram_init_data_replays"
  USING (public.app_auth_flow())
  WITH CHECK (public.app_auth_flow());
--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'avero_app') THEN
    GRANT SELECT, INSERT, DELETE ON "telegram_init_data_replays" TO avero_app;
  END IF;
END
$$;
