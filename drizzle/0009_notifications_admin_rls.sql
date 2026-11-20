-- Custom SQL migration: Super Admin Role, Notification Delivery Helper, Moderation & Admin Governance RLS

-- 1. Update staff & admin role helpers to include 'super_admin'
CREATE OR REPLACE FUNCTION public.app_is_staff() RETURNS boolean AS $$
BEGIN
  RETURN public.app_user_role() IN ('moderator', 'admin', 'super_admin');
END;
$$ LANGUAGE plpgsql STABLE;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.app_is_admin_or_super() RETURNS boolean AS $$
BEGIN
  RETURN public.app_user_role() IN ('admin', 'super_admin');
END;
$$ LANGUAGE plpgsql STABLE;
--> statement-breakpoint

-- 2. Secure notification delivery lookup without exposing user_settings rows across users
CREATE OR REPLACE FUNCTION public.get_notification_delivery_settings(target_user_id uuid)
RETURNS TABLE (
  telegram_bot_started boolean,
  telegram_notifications boolean,
  telegram_chat_id varchar,
  notification_preferences jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    us.telegram_bot_started,
    us.telegram_notifications,
    us.telegram_chat_id,
    us.notification_preferences
  FROM public.user_settings us
  WHERE us.user_id = target_user_id
  LIMIT 1;
$$;
--> statement-breakpoint

-- 3. Update users UPDATE policy:
--    - super_admin: full governance updates
--    - admin: cannot alter super_admin rows or promote to super_admin
--    - moderator: can ONLY mute/suspend/restore role='user' accounts (NEVER set banned or change roles)
--    - auth_flow: system auth flows
DROP POLICY IF EXISTS "users_update_admin_or_auth_flow" ON "users";
CREATE POLICY "users_update_governance_or_auth_flow" ON "users" FOR UPDATE
USING (
  public.app_user_role() = 'super_admin'
  OR (public.app_user_role() = 'admin' AND "role" <> 'super_admin')
  OR (public.app_user_role() = 'moderator' AND "role" = 'user')
  OR public.app_auth_flow()
)
WITH CHECK (
  public.app_user_role() = 'super_admin'
  OR (public.app_user_role() = 'admin' AND "role" <> 'super_admin')
  OR (public.app_user_role() = 'moderator' AND "role" = 'user' AND "status" IN ('active', 'muted', 'suspended'))
  OR public.app_auth_flow()
);
--> statement-breakpoint

-- 4. Update audit_logs SELECT policy: admin and super_admin ONLY (moderators cannot read or edit)
DROP POLICY IF EXISTS "audit_logs_select_admin" ON "audit_logs";
CREATE POLICY "audit_logs_select_admin" ON "audit_logs" FOR SELECT USING (
  public.app_user_role() IN ('admin', 'super_admin')
);
--> statement-breakpoint

-- 5. Allow staff/governance session revocation on suspension/ban
DROP POLICY IF EXISTS "user_sessions_update_policy" ON "user_sessions";
CREATE POLICY "user_sessions_update_policy" ON "user_sessions" FOR UPDATE
USING (
  "user_id" = public.app_user_id()
  OR public.app_is_staff()
  OR public.app_auth_flow()
)
WITH CHECK (
  "user_id" = public.app_user_id()
  OR public.app_is_staff()
  OR public.app_auth_flow()
);
--> statement-breakpoint

-- 6. Allow staff to delete moderated comments + update comment_reports
DROP POLICY IF EXISTS "comments_delete_owner_or_post_owner" ON "post_comments";
CREATE POLICY "comments_delete_owner_or_post_owner_or_staff" ON "post_comments" FOR DELETE USING (
  "author_id" = public.app_user_id()
  OR public.app_is_staff()
  OR EXISTS (
    SELECT 1 FROM public.posts p
    WHERE p.id = post_id AND p.author_id = public.app_user_id()
  )
);
--> statement-breakpoint

CREATE POLICY "comment_reports_update_staff" ON "comment_reports" FOR UPDATE
USING (public.app_is_staff())
WITH CHECK (public.app_is_staff());
--> statement-breakpoint

-- 7. Notifications: allow auth_flow inserts too (e.g., webhook / verification / system flows)
DROP POLICY IF EXISTS "notifications_insert_actor" ON "notifications";
CREATE POLICY "notifications_insert_actor" ON "notifications" FOR INSERT WITH CHECK (
  "actor_id" = public.app_user_id()
  OR public.app_auth_flow()
);
--> statement-breakpoint

-- 7b. User settings: allow auth_flow updates (for Telegram bot /start webhook)
DROP POLICY IF EXISTS "user_settings_update_owner" ON "user_settings";
CREATE POLICY "user_settings_update_owner_or_auth_flow" ON "user_settings" FOR UPDATE
USING (
  "user_id" = public.app_user_id()
  OR public.app_auth_flow()
)
WITH CHECK (
  "user_id" = public.app_user_id()
  OR public.app_auth_flow()
);
--> statement-breakpoint

-- 8. ADMIN_USER_PERMISSIONS RLS (strictly Super Admin grants/revokes)
ALTER TABLE "admin_user_permissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "admin_user_permissions" FORCE ROW LEVEL SECURITY;
CREATE POLICY "admin_perms_select_self_or_super" ON "admin_user_permissions" FOR SELECT USING (
  "user_id" = public.app_user_id()
  OR public.app_user_role() = 'super_admin'
);
CREATE POLICY "admin_perms_insert_super_admin" ON "admin_user_permissions" FOR INSERT WITH CHECK (
  public.app_user_role() = 'super_admin'
);
CREATE POLICY "admin_perms_delete_super_admin" ON "admin_user_permissions" FOR DELETE USING (
  public.app_user_role() = 'super_admin'
);
--> statement-breakpoint

-- 9. MODERATION_FLAGS RLS
ALTER TABLE "moderation_flags" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "moderation_flags" FORCE ROW LEVEL SECURITY;
CREATE POLICY "mod_flags_select_staff" ON "moderation_flags" FOR SELECT USING (
  public.app_is_staff()
);
CREATE POLICY "mod_flags_insert_author_or_staff" ON "moderation_flags" FOR INSERT WITH CHECK (
  "author_id" = public.app_user_id()
  OR public.app_is_staff()
);
CREATE POLICY "mod_flags_update_staff" ON "moderation_flags" FOR UPDATE
USING (public.app_is_staff())
WITH CHECK (public.app_is_staff());
--> statement-breakpoint

-- 10. USER_WARNINGS RLS
ALTER TABLE "user_warnings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_warnings" FORCE ROW LEVEL SECURITY;
CREATE POLICY "user_warnings_select_owner_or_staff" ON "user_warnings" FOR SELECT USING (
  "user_id" = public.app_user_id()
  OR public.app_is_staff()
);
CREATE POLICY "user_warnings_insert_staff" ON "user_warnings" FOR INSERT WITH CHECK (
  public.app_is_staff()
);
--> statement-breakpoint

-- 11. MODERATION_APPEALS RLS
ALTER TABLE "moderation_appeals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "moderation_appeals" FORCE ROW LEVEL SECURITY;
CREATE POLICY "mod_appeals_select_owner_or_staff" ON "moderation_appeals" FOR SELECT USING (
  "user_id" = public.app_user_id()
  OR public.app_is_staff()
);
CREATE POLICY "mod_appeals_insert_owner" ON "moderation_appeals" FOR INSERT WITH CHECK (
  "user_id" = public.app_user_id()
);
CREATE POLICY "mod_appeals_update_admin_or_super" ON "moderation_appeals" FOR UPDATE
USING (public.app_user_role() IN ('admin', 'super_admin'))
WITH CHECK (public.app_user_role() IN ('admin', 'super_admin'));
--> statement-breakpoint

-- 12. PLATFORM_ANNOUNCEMENTS RLS
ALTER TABLE "platform_announcements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "platform_announcements" FORCE ROW LEVEL SECURITY;
CREATE POLICY "announcements_select_all" ON "platform_announcements" FOR SELECT USING (true);
CREATE POLICY "announcements_insert_admin_or_super" ON "platform_announcements" FOR INSERT WITH CHECK (
  public.app_user_role() IN ('admin', 'super_admin')
);
CREATE POLICY "announcements_update_admin_or_super" ON "platform_announcements" FOR UPDATE
USING (public.app_user_role() IN ('admin', 'super_admin'))
WITH CHECK (public.app_user_role() IN ('admin', 'super_admin'));
--> statement-breakpoint

-- 13. Grant least-privilege table access to runtime role avero_app
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'avero_app') THEN
    GRANT UPDATE ON "comment_reports" TO avero_app;
    GRANT SELECT, INSERT, DELETE ON "admin_user_permissions" TO avero_app;
    GRANT SELECT, INSERT, UPDATE ON "moderation_flags", "moderation_appeals", "platform_announcements" TO avero_app;
    GRANT SELECT, INSERT ON "user_warnings" TO avero_app;
  END IF;
END
$$;
