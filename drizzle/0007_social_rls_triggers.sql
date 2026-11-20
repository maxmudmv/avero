-- Custom SQL migration: Social Interaction Triggers, Block Helper, and RLS Policies

-- 1. Comment likes & comment replies counter triggers
CREATE OR REPLACE FUNCTION public.fn_sync_comment_likes_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.post_comments SET likes_count = likes_count + 1 WHERE id = NEW.comment_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.post_comments SET likes_count = GREATEST(0, likes_count - 1) WHERE id = OLD.comment_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER trg_comment_likes_sync_count
  AFTER INSERT OR DELETE ON "comment_likes"
  FOR EACH ROW EXECUTE FUNCTION public.fn_sync_comment_likes_count();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.fn_sync_comment_replies_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.parent_comment_id IS NOT NULL THEN
    UPDATE public.post_comments SET replies_count = replies_count + 1 WHERE id = NEW.parent_comment_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' AND OLD.parent_comment_id IS NOT NULL THEN
    UPDATE public.post_comments SET replies_count = GREATEST(0, replies_count - 1) WHERE id = OLD.parent_comment_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER trg_comment_replies_sync_count
  AFTER INSERT OR DELETE ON "post_comments"
  FOR EACH ROW EXECUTE FUNCTION public.fn_sync_comment_replies_count();
--> statement-breakpoint

-- 2. Granular Block Check Helper (unbypassable)
CREATE OR REPLACE FUNCTION public.is_blocked_between(
  user_a uuid,
  user_b uuid,
  required_scope text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_blocks b
    WHERE (
      (b.blocker_id = user_a AND b.blocked_id = user_b)
      OR (b.blocker_id = user_b AND b.blocked_id = user_a)
    )
    AND (b.level = 'full' OR b.level = required_scope)
  );
$$;
--> statement-breakpoint

-- 3. Allow post owner OR comment author to delete comments; allow triggers to update post_comments
ALTER TABLE "post_comments" NO FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "comments_delete_owner" ON "post_comments";
CREATE POLICY "comments_delete_owner_or_post_owner" ON "post_comments" FOR DELETE USING (
  "author_id" = public.app_user_id()
  OR EXISTS (
    SELECT 1 FROM public.posts p
    WHERE p.id = post_id AND p.author_id = public.app_user_id()
  )
);
--> statement-breakpoint

-- 4. COMMENT_LIKES RLS
ALTER TABLE "comment_likes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "comment_likes" FORCE ROW LEVEL SECURITY;
CREATE POLICY "comment_likes_select_public" ON "comment_likes" FOR SELECT USING (true);
CREATE POLICY "comment_likes_insert_owner" ON "comment_likes" FOR INSERT WITH CHECK ("user_id" = public.app_user_id());
CREATE POLICY "comment_likes_delete_owner" ON "comment_likes" FOR DELETE USING ("user_id" = public.app_user_id());
--> statement-breakpoint

-- 5. NOTIFICATIONS RLS (sender inserts as actor, recipient reads/marks read)
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notifications" FORCE ROW LEVEL SECURITY;
CREATE POLICY "notifications_select_recipient" ON "notifications" FOR SELECT USING ("recipient_id" = public.app_user_id());
CREATE POLICY "notifications_insert_actor" ON "notifications" FOR INSERT WITH CHECK ("actor_id" = public.app_user_id());
CREATE POLICY "notifications_update_recipient" ON "notifications" FOR UPDATE
  USING ("recipient_id" = public.app_user_id())
  WITH CHECK ("recipient_id" = public.app_user_id());
CREATE POLICY "notifications_delete_recipient" ON "notifications" FOR DELETE USING ("recipient_id" = public.app_user_id());
--> statement-breakpoint

-- 6. USER_BLOCKS RLS
ALTER TABLE "user_blocks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_blocks" FORCE ROW LEVEL SECURITY;
CREATE POLICY "user_blocks_select_participant" ON "user_blocks" FOR SELECT USING (
  "blocker_id" = public.app_user_id() OR "blocked_id" = public.app_user_id()
);
CREATE POLICY "user_blocks_insert_blocker" ON "user_blocks" FOR INSERT WITH CHECK ("blocker_id" = public.app_user_id());
CREATE POLICY "user_blocks_update_blocker" ON "user_blocks" FOR UPDATE
  USING ("blocker_id" = public.app_user_id())
  WITH CHECK ("blocker_id" = public.app_user_id());
CREATE POLICY "user_blocks_delete_blocker" ON "user_blocks" FOR DELETE USING ("blocker_id" = public.app_user_id());
--> statement-breakpoint

-- 7. DM_THREADS & DM_MESSAGES RLS
ALTER TABLE "dm_threads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dm_threads" FORCE ROW LEVEL SECURITY;
CREATE POLICY "dm_threads_select_participant" ON "dm_threads" FOR SELECT USING (
  "user1_id" = public.app_user_id() OR "user2_id" = public.app_user_id()
);
CREATE POLICY "dm_threads_insert_participant" ON "dm_threads" FOR INSERT WITH CHECK (
  "initiated_by" = public.app_user_id()
  AND ("user1_id" = public.app_user_id() OR "user2_id" = public.app_user_id())
);
CREATE POLICY "dm_threads_update_participant" ON "dm_threads" FOR UPDATE
  USING ("user1_id" = public.app_user_id() OR "user2_id" = public.app_user_id())
  WITH CHECK ("user1_id" = public.app_user_id() OR "user2_id" = public.app_user_id());
--> statement-breakpoint

ALTER TABLE "dm_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dm_messages" FORCE ROW LEVEL SECURITY;
CREATE POLICY "dm_messages_select_participant" ON "dm_messages" FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.dm_threads t
    WHERE t.id = thread_id
      AND (t.user1_id = public.app_user_id() OR t.user2_id = public.app_user_id())
  )
);
CREATE POLICY "dm_messages_insert_sender" ON "dm_messages" FOR INSERT WITH CHECK (
  "sender_id" = public.app_user_id()
  AND EXISTS (
    SELECT 1 FROM public.dm_threads t
    WHERE t.id = thread_id
      AND (t.user1_id = public.app_user_id() OR t.user2_id = public.app_user_id())
  )
);
--> statement-breakpoint

-- 8. COMMENT_REPORTS RLS
ALTER TABLE "comment_reports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "comment_reports" FORCE ROW LEVEL SECURITY;
CREATE POLICY "comment_reports_select_owner_or_staff" ON "comment_reports" FOR SELECT USING (
  "reporter_id" = public.app_user_id() OR public.app_is_staff()
);
CREATE POLICY "comment_reports_insert_reporter" ON "comment_reports" FOR INSERT WITH CHECK (
  "reporter_id" = public.app_user_id()
);
--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'avero_app') THEN
    GRANT SELECT, INSERT, DELETE ON "comment_likes" TO avero_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON "notifications", "user_blocks" TO avero_app;
    GRANT SELECT, INSERT, UPDATE ON "dm_threads" TO avero_app;
    GRANT SELECT, INSERT ON "dm_messages", "comment_reports" TO avero_app;
  END IF;
END
$$;
