-- Custom SQL migration: RLS Helper Functions, Row Level Security Policies, and App Role Privileges

CREATE OR REPLACE FUNCTION public.app_user_id() RETURNS uuid AS $$
DECLARE
  v text := NULLIF(current_setting('app.current_user_id', true), '');
BEGIN
  IF v IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN v::uuid;
EXCEPTION WHEN invalid_text_representation THEN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.app_user_role() RETURNS text AS $$
BEGIN
  RETURN COALESCE(NULLIF(current_setting('app.current_user_role', true), ''), 'anonymous');
END;
$$ LANGUAGE plpgsql STABLE;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.app_is_staff() RETURNS boolean AS $$
BEGIN
  RETURN public.app_user_role() IN ('moderator', 'admin');
END;
$$ LANGUAGE plpgsql STABLE;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.app_auth_flow() RETURNS boolean AS $$
BEGIN
  RETURN current_setting('app.auth_context', true) = 'auth_flow';
END;
$$ LANGUAGE plpgsql STABLE;
--> statement-breakpoint

-- RBAC reference tables: readable by runtime, writable only by migrator/table owner
ALTER TABLE "roles" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "roles_select_all" ON "roles" FOR SELECT USING (true);
--> statement-breakpoint

ALTER TABLE "permissions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "permissions_select_all" ON "permissions" FOR SELECT USING (true);
--> statement-breakpoint

ALTER TABLE "role_permissions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "role_permissions_select_all" ON "role_permissions" FOR SELECT USING (true);
--> statement-breakpoint

-- Users table: private identity & role/status; regular users cannot alter role/status
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users" FORCE ROW LEVEL SECURITY;
CREATE POLICY "users_select_policy" ON "users" FOR SELECT USING (
  "id" = public.app_user_id()
  OR public.app_is_staff()
  OR public.app_auth_flow()
);
CREATE POLICY "users_insert_auth_flow" ON "users" FOR INSERT WITH CHECK (
  public.app_auth_flow()
);
CREATE POLICY "users_update_admin_or_auth_flow" ON "users" FOR UPDATE
USING (
  public.app_user_role() = 'admin'
  OR public.app_auth_flow()
)
WITH CHECK (
  public.app_user_role() = 'admin'
  OR public.app_auth_flow()
);
--> statement-breakpoint

-- Profiles table: public read, owner/staff write
ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "profiles" FORCE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select_public" ON "profiles" FOR SELECT USING (true);
CREATE POLICY "profiles_insert_policy" ON "profiles" FOR INSERT WITH CHECK (
  "user_id" = public.app_user_id()
  OR public.app_auth_flow()
);
CREATE POLICY "profiles_update_policy" ON "profiles" FOR UPDATE
USING (
  "user_id" = public.app_user_id()
  OR public.app_is_staff()
)
WITH CHECK (
  "user_id" = public.app_user_id()
  OR public.app_is_staff()
);
--> statement-breakpoint

-- User settings table: strictly private to owner
ALTER TABLE "user_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_settings" FORCE ROW LEVEL SECURITY;
CREATE POLICY "user_settings_select_owner" ON "user_settings" FOR SELECT USING (
  "user_id" = public.app_user_id()
  OR public.app_auth_flow()
);
CREATE POLICY "user_settings_insert_owner" ON "user_settings" FOR INSERT WITH CHECK (
  "user_id" = public.app_user_id()
  OR public.app_auth_flow()
);
CREATE POLICY "user_settings_update_owner" ON "user_settings" FOR UPDATE
USING ("user_id" = public.app_user_id())
WITH CHECK ("user_id" = public.app_user_id());
--> statement-breakpoint

-- Auth identities: strictly owner or auth_flow
ALTER TABLE "auth_identities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "auth_identities" FORCE ROW LEVEL SECURITY;
CREATE POLICY "auth_identities_select_policy" ON "auth_identities" FOR SELECT USING (
  "user_id" = public.app_user_id()
  OR public.app_auth_flow()
);
CREATE POLICY "auth_identities_insert_policy" ON "auth_identities" FOR INSERT WITH CHECK (
  "user_id" = public.app_user_id()
  OR public.app_auth_flow()
);
CREATE POLICY "auth_identities_update_policy" ON "auth_identities" FOR UPDATE
USING (
  "user_id" = public.app_user_id()
  OR public.app_auth_flow()
)
WITH CHECK (
  "user_id" = public.app_user_id()
  OR public.app_auth_flow()
);
CREATE POLICY "auth_identities_delete_owner" ON "auth_identities" FOR DELETE USING (
  "user_id" = public.app_user_id()
);
--> statement-breakpoint

-- User sessions: strictly owner or auth_flow
ALTER TABLE "user_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_sessions" FORCE ROW LEVEL SECURITY;
CREATE POLICY "user_sessions_select_policy" ON "user_sessions" FOR SELECT USING (
  "user_id" = public.app_user_id()
  OR public.app_auth_flow()
);
CREATE POLICY "user_sessions_insert_policy" ON "user_sessions" FOR INSERT WITH CHECK (
  "user_id" = public.app_user_id()
  OR public.app_auth_flow()
);
CREATE POLICY "user_sessions_update_policy" ON "user_sessions" FOR UPDATE
USING (
  "user_id" = public.app_user_id()
  OR public.app_auth_flow()
)
WITH CHECK (
  "user_id" = public.app_user_id()
  OR public.app_auth_flow()
);
CREATE POLICY "user_sessions_delete_owner" ON "user_sessions" FOR DELETE USING (
  "user_id" = public.app_user_id()
);
--> statement-breakpoint

-- Email verification tokens
ALTER TABLE "email_verification_tokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "email_verification_tokens" FORCE ROW LEVEL SECURITY;
CREATE POLICY "email_tokens_select_policy" ON "email_verification_tokens" FOR SELECT USING (
  "user_id" = public.app_user_id()
  OR public.app_auth_flow()
);
CREATE POLICY "email_tokens_insert_policy" ON "email_verification_tokens" FOR INSERT WITH CHECK (
  "user_id" = public.app_user_id()
  OR public.app_auth_flow()
);
CREATE POLICY "email_tokens_update_policy" ON "email_verification_tokens" FOR UPDATE
USING (
  "user_id" = public.app_user_id()
  OR public.app_auth_flow()
)
WITH CHECK (
  "user_id" = public.app_user_id()
  OR public.app_auth_flow()
);
--> statement-breakpoint

-- Account link tokens
ALTER TABLE "account_link_tokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "account_link_tokens" FORCE ROW LEVEL SECURITY;
CREATE POLICY "link_tokens_select_policy" ON "account_link_tokens" FOR SELECT USING (
  "user_id" = public.app_user_id()
  OR public.app_auth_flow()
);
CREATE POLICY "link_tokens_insert_owner" ON "account_link_tokens" FOR INSERT WITH CHECK (
  "user_id" = public.app_user_id()
);
CREATE POLICY "link_tokens_update_policy" ON "account_link_tokens" FOR UPDATE
USING (
  "user_id" = public.app_user_id()
  OR public.app_auth_flow()
)
WITH CHECK (
  "user_id" = public.app_user_id()
  OR public.app_auth_flow()
);
--> statement-breakpoint

-- Audit logs: append-only, readable only by admin
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" FORCE ROW LEVEL SECURITY;
CREATE POLICY "audit_logs_insert_all" ON "audit_logs" FOR INSERT WITH CHECK (true);
CREATE POLICY "audit_logs_select_admin" ON "audit_logs" FOR SELECT USING (
  public.app_user_role() = 'admin'
);
--> statement-breakpoint

-- Non-superuser runtime role `avero_app` (NOBYPASSRLS) and least-privilege grants
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'avero_app') THEN
    BEGIN
      CREATE ROLE avero_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'Skipping CREATE ROLE avero_app due to insufficient_privilege';
    END;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'avero_app') THEN
    GRANT USAGE ON SCHEMA public TO avero_app;
    GRANT SELECT ON "roles", "permissions", "role_permissions" TO avero_app;
    GRANT SELECT, INSERT, UPDATE ON "users", "profiles", "user_settings", "email_verification_tokens", "account_link_tokens" TO avero_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON "auth_identities", "user_sessions" TO avero_app;
    GRANT SELECT, INSERT ON "audit_logs" TO avero_app;
    GRANT USAGE, SELECT ON SEQUENCE "audit_logs_id_seq" TO avero_app;
    REVOKE UPDATE, DELETE, TRUNCATE ON "audit_logs" FROM avero_app;
    REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON "roles", "permissions", "role_permissions" FROM avero_app;
  END IF;
END
$$;
