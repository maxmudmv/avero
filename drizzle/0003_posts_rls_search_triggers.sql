-- Custom SQL migration: Full-Text Search, Trigram Indexes, Atomic Counter Triggers, and RLS for Posts & Social Graph

CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint

ALTER TABLE "posts"
  ADD COLUMN IF NOT EXISTS "search_vector" tsvector
  GENERATED ALWAYS AS (to_tsvector('simple', "body")) STORED;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_posts_search_vector"
  ON "posts" USING GIN ("search_vector");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_posts_body_trgm"
  ON "posts" USING GIN (lower("body") gin_trgm_ops);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_profiles_username_trgm"
  ON "profiles" USING GIN (lower("username") gin_trgm_ops);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_profiles_display_name_trgm"
  ON "profiles" USING GIN (lower("display_name") gin_trgm_ops);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_hashtags_tag_trgm"
  ON "hashtags" USING GIN (lower("tag") gin_trgm_ops);
--> statement-breakpoint

-- Safe verification badge helper without exposing private `users` columns
CREATE OR REPLACE FUNCTION public.is_user_verified(target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = target_user_id AND email_verified_at IS NOT NULL
  );
$$;
--> statement-breakpoint

-- SECURITY DEFINER counter trigger functions (preserve strict RLS on posts & profiles)
CREATE OR REPLACE FUNCTION public.fn_sync_profile_posts_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.profiles
      SET posts_count = posts_count + 1
      WHERE user_id = NEW.author_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.profiles
      SET posts_count = GREATEST(0, posts_count - 1)
      WHERE user_id = OLD.author_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER trg_posts_sync_profile_count
  AFTER INSERT OR DELETE ON "posts"
  FOR EACH ROW EXECUTE FUNCTION public.fn_sync_profile_posts_count();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.fn_sync_post_likes_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts SET likes_count = likes_count + 1 WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.posts SET likes_count = GREATEST(0, likes_count - 1) WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER trg_post_likes_sync_count
  AFTER INSERT OR DELETE ON "post_likes"
  FOR EACH ROW EXECUTE FUNCTION public.fn_sync_post_likes_count();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.fn_sync_post_comments_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts SET comments_count = comments_count + 1 WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.posts SET comments_count = GREATEST(0, comments_count - 1) WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER trg_post_comments_sync_count
  AFTER INSERT OR DELETE ON "post_comments"
  FOR EACH ROW EXECUTE FUNCTION public.fn_sync_post_comments_count();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.fn_sync_post_views_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts SET views_count = views_count + 1 WHERE id = NEW.post_id;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER trg_post_views_sync_count
  AFTER INSERT ON "post_views"
  FOR EACH ROW EXECUTE FUNCTION public.fn_sync_post_views_count();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.fn_sync_post_reposts_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts SET reposts_count = reposts_count + 1 WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.posts SET reposts_count = GREATEST(0, reposts_count - 1) WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER trg_post_reposts_sync_count
  AFTER INSERT OR DELETE ON "post_reposts"
  FOR EACH ROW EXECUTE FUNCTION public.fn_sync_post_reposts_count();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.fn_sync_post_bookmarks_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts SET bookmarks_count = bookmarks_count + 1 WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.posts SET bookmarks_count = GREATEST(0, bookmarks_count - 1) WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER trg_post_bookmarks_sync_count
  AFTER INSERT OR DELETE ON "post_bookmarks"
  FOR EACH ROW EXECUTE FUNCTION public.fn_sync_post_bookmarks_count();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.fn_sync_hashtag_posts_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.hashtags SET posts_count = posts_count + 1 WHERE id = NEW.hashtag_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.hashtags SET posts_count = GREATEST(0, posts_count - 1) WHERE id = OLD.hashtag_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER trg_post_hashtags_sync_count
  AFTER INSERT OR DELETE ON "post_hashtags"
  FOR EACH ROW EXECUTE FUNCTION public.fn_sync_hashtag_posts_count();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.fn_sync_follows_counts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.profiles SET following_count = following_count + 1 WHERE user_id = NEW.follower_id;
    UPDATE public.profiles SET followers_count = followers_count + 1 WHERE user_id = NEW.following_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.profiles SET following_count = GREATEST(0, following_count - 1) WHERE user_id = OLD.follower_id;
    UPDATE public.profiles SET followers_count = GREATEST(0, followers_count - 1) WHERE user_id = OLD.following_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER trg_follows_sync_counts
  AFTER INSERT OR DELETE ON "follows"
  FOR EACH ROW EXECUTE FUNCTION public.fn_sync_follows_counts();
--> statement-breakpoint

-- RLS Policies for all new tables

-- 1. POSTS: all posts are public; mutations strictly restricted to author
-- Note: ENABLE (not FORCE) lets SECURITY DEFINER counter triggers owned by avero_migrator
-- update counters safely while avero_app remains strictly bound by RLS.
ALTER TABLE "posts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "profiles" NO FORCE ROW LEVEL SECURITY;
CREATE POLICY "posts_select_public" ON "posts" FOR SELECT USING (true);
CREATE POLICY "posts_insert_owner" ON "posts" FOR INSERT WITH CHECK ("author_id" = public.app_user_id());
CREATE POLICY "posts_update_owner" ON "posts" FOR UPDATE
  USING ("author_id" = public.app_user_id())
  WITH CHECK ("author_id" = public.app_user_id());
CREATE POLICY "posts_delete_owner" ON "posts" FOR DELETE USING ("author_id" = public.app_user_id());
--> statement-breakpoint

-- 2. POST_DRAFTS: strictly private to owner ONLY
ALTER TABLE "post_drafts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "post_drafts" FORCE ROW LEVEL SECURITY;
CREATE POLICY "drafts_select_owner" ON "post_drafts" FOR SELECT USING ("author_id" = public.app_user_id());
CREATE POLICY "drafts_insert_owner" ON "post_drafts" FOR INSERT WITH CHECK ("author_id" = public.app_user_id());
CREATE POLICY "drafts_update_owner" ON "post_drafts" FOR UPDATE
  USING ("author_id" = public.app_user_id())
  WITH CHECK ("author_id" = public.app_user_id());
CREATE POLICY "drafts_delete_owner" ON "post_drafts" FOR DELETE USING ("author_id" = public.app_user_id());
--> statement-breakpoint

-- 3. HASHTAGS & POST_HASHTAGS
ALTER TABLE "hashtags" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hashtags_select_public" ON "hashtags" FOR SELECT USING (true);
CREATE POLICY "hashtags_insert_auth" ON "hashtags" FOR INSERT WITH CHECK (public.app_user_id() IS NOT NULL);
--> statement-breakpoint

ALTER TABLE "post_hashtags" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "post_hashtags" FORCE ROW LEVEL SECURITY;
CREATE POLICY "post_hashtags_select_public" ON "post_hashtags" FOR SELECT USING (true);
CREATE POLICY "post_hashtags_insert_post_owner" ON "post_hashtags" FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_id AND p.author_id = public.app_user_id())
);
CREATE POLICY "post_hashtags_delete_post_owner" ON "post_hashtags" FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_id AND p.author_id = public.app_user_id())
);
--> statement-breakpoint

-- 4. POST_COMMENTS
ALTER TABLE "post_comments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "post_comments" FORCE ROW LEVEL SECURITY;
CREATE POLICY "comments_select_public" ON "post_comments" FOR SELECT USING (true);
CREATE POLICY "comments_insert_owner" ON "post_comments" FOR INSERT WITH CHECK ("author_id" = public.app_user_id());
CREATE POLICY "comments_delete_owner" ON "post_comments" FOR DELETE USING ("author_id" = public.app_user_id());
--> statement-breakpoint

-- 5. POST_LIKES & POST_REPOSTS
ALTER TABLE "post_likes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "post_likes" FORCE ROW LEVEL SECURITY;
CREATE POLICY "likes_select_public" ON "post_likes" FOR SELECT USING (true);
CREATE POLICY "likes_insert_owner" ON "post_likes" FOR INSERT WITH CHECK ("user_id" = public.app_user_id());
CREATE POLICY "likes_delete_owner" ON "post_likes" FOR DELETE USING ("user_id" = public.app_user_id());
--> statement-breakpoint

ALTER TABLE "post_reposts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "post_reposts" FORCE ROW LEVEL SECURITY;
CREATE POLICY "reposts_select_public" ON "post_reposts" FOR SELECT USING (true);
CREATE POLICY "reposts_insert_owner" ON "post_reposts" FOR INSERT WITH CHECK ("user_id" = public.app_user_id());
CREATE POLICY "reposts_delete_owner" ON "post_reposts" FOR DELETE USING ("user_id" = public.app_user_id());
--> statement-breakpoint

-- 6. POST_BOOKMARKS (private to owner)
ALTER TABLE "post_bookmarks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "post_bookmarks" FORCE ROW LEVEL SECURITY;
CREATE POLICY "bookmarks_select_owner" ON "post_bookmarks" FOR SELECT USING ("user_id" = public.app_user_id());
CREATE POLICY "bookmarks_insert_owner" ON "post_bookmarks" FOR INSERT WITH CHECK ("user_id" = public.app_user_id());
CREATE POLICY "bookmarks_delete_owner" ON "post_bookmarks" FOR DELETE USING ("user_id" = public.app_user_id());
--> statement-breakpoint

-- 7. POST_VIEWS (1 unique view per user)
ALTER TABLE "post_views" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "post_views" FORCE ROW LEVEL SECURITY;
CREATE POLICY "views_select_owner" ON "post_views" FOR SELECT USING ("user_id" = public.app_user_id());
CREATE POLICY "views_insert_owner" ON "post_views" FOR INSERT WITH CHECK ("user_id" = public.app_user_id());
--> statement-breakpoint

-- 8. FOLLOWS
ALTER TABLE "follows" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "follows" FORCE ROW LEVEL SECURITY;
CREATE POLICY "follows_select_public" ON "follows" FOR SELECT USING (true);
CREATE POLICY "follows_insert_owner" ON "follows" FOR INSERT WITH CHECK ("follower_id" = public.app_user_id());
CREATE POLICY "follows_delete_owner" ON "follows" FOR DELETE USING ("follower_id" = public.app_user_id());
--> statement-breakpoint

-- 9. REFERRALS
ALTER TABLE "referrals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "referrals" FORCE ROW LEVEL SECURITY;
CREATE POLICY "referrals_select_participant" ON "referrals" FOR SELECT USING (
  "inviter_id" = public.app_user_id()
  OR "invitee_id" = public.app_user_id()
  OR public.app_auth_flow()
);
CREATE POLICY "referrals_insert_policy" ON "referrals" FOR INSERT WITH CHECK (
  "invitee_id" = public.app_user_id()
  OR public.app_auth_flow()
);
--> statement-breakpoint

-- Grant privileges to avero_app
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'avero_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      "posts", "post_drafts", "post_hashtags", "post_comments",
      "post_likes", "post_reposts", "post_bookmarks", "follows"
      TO avero_app;
    GRANT SELECT, INSERT ON "hashtags", "post_views", "referrals" TO avero_app;
  END IF;
END
$$;
