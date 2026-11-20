-- Custom SQL migration: RLS for user_activity & follow_requests + safe follow/online policy helpers
-- Note: NO FORCE on users/user_settings allows SECURITY DEFINER helpers owned by avero_migrator
-- to read single public booleans/follow-policy while avero_app remains strictly bound by RLS.
ALTER TABLE "users" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "user_settings" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.get_follow_policy(target_user_id uuid)
RETURNS TABLE(privacy_level text, auto_approve_follows boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT s.privacy_level::text, s.auto_approve_follows
  FROM public.user_settings s
  WHERE s.user_id = target_user_id;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.is_profile_online(target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    (
      SELECT s.show_online_status AND p.last_seen_at > (now() - interval '5 minutes')
      FROM public.user_settings s
      INNER JOIN public.profiles p ON p.user_id = s.user_id
      WHERE s.user_id = target_user_id
    ),
    false
  );
$$;
--> statement-breakpoint

-- USER_ACTIVITY: strictly private to profile owner (or auth_flow during provisioning)
ALTER TABLE "user_activity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_activity" FORCE ROW LEVEL SECURITY;
CREATE POLICY "user_activity_select_owner" ON "user_activity" FOR SELECT USING (
  "user_id" = public.app_user_id() OR public.app_auth_flow()
);
CREATE POLICY "user_activity_insert_owner" ON "user_activity" FOR INSERT WITH CHECK (
  "user_id" = public.app_user_id() OR public.app_auth_flow()
);
CREATE POLICY "user_activity_update_owner" ON "user_activity" FOR UPDATE
  USING ("user_id" = public.app_user_id() OR public.app_auth_flow())
  WITH CHECK ("user_id" = public.app_user_id() OR public.app_auth_flow());
--> statement-breakpoint

-- FOLLOW_REQUESTS: visible and manageable only by requester or target owner
ALTER TABLE "follow_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "follow_requests" FORCE ROW LEVEL SECURITY;
CREATE POLICY "follow_requests_select_participant" ON "follow_requests" FOR SELECT USING (
  "requester_id" = public.app_user_id() OR "target_id" = public.app_user_id()
);
CREATE POLICY "follow_requests_insert_requester" ON "follow_requests" FOR INSERT WITH CHECK (
  "requester_id" = public.app_user_id()
);
CREATE POLICY "follow_requests_update_participant" ON "follow_requests" FOR UPDATE
  USING ("requester_id" = public.app_user_id() OR "target_id" = public.app_user_id())
  WITH CHECK ("requester_id" = public.app_user_id() OR "target_id" = public.app_user_id());
CREATE POLICY "follow_requests_delete_participant" ON "follow_requests" FOR DELETE USING (
  "requester_id" = public.app_user_id() OR "target_id" = public.app_user_id()
);
--> statement-breakpoint

-- Allow target profile owner to materialize an accepted follow request into follows
CREATE POLICY "follows_insert_accepted_request" ON "follows" FOR INSERT WITH CHECK (
  "following_id" = public.app_user_id()
  AND EXISTS (
    SELECT 1 FROM public.follow_requests fr
    WHERE fr.requester_id = follower_id
      AND fr.target_id = following_id
      AND fr.status = 'accepted'
  )
);
--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'avero_app') THEN
    GRANT SELECT, INSERT, UPDATE ON "user_activity" TO avero_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON "follow_requests" TO avero_app;
  END IF;
END
$$;
