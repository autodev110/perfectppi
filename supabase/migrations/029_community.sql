-- ============================================================================
-- Migration 029: Community Feed
-- Parent platform module — lightweight vehicle-focused posts and comments
-- ============================================================================

CREATE TYPE public.community_content_status AS ENUM ('active', 'hidden', 'archived');

CREATE TABLE public.community_posts (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id              uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  vehicle_id             uuid REFERENCES public.vehicles(id) ON DELETE SET NULL,
  marketplace_listing_id uuid REFERENCES public.marketplace_listings(id) ON DELETE SET NULL,
  content                text NOT NULL CHECK (char_length(btrim(content)) > 0 AND char_length(content) <= 1200),
  status                 public.community_content_status NOT NULL DEFAULT 'active',
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.community_comments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    uuid NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  author_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content    text NOT NULL CHECK (char_length(btrim(content)) > 0 AND char_length(content) <= 600),
  status     public.community_content_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_community_posts_author   ON public.community_posts(author_id);
CREATE INDEX idx_community_posts_vehicle  ON public.community_posts(vehicle_id);
CREATE INDEX idx_community_posts_listing  ON public.community_posts(marketplace_listing_id);
CREATE INDEX idx_community_posts_status   ON public.community_posts(status);
CREATE INDEX idx_community_posts_created  ON public.community_posts(created_at DESC);

CREATE INDEX idx_community_comments_post    ON public.community_comments(post_id);
CREATE INDEX idx_community_comments_author  ON public.community_comments(author_id);
CREATE INDEX idx_community_comments_status  ON public.community_comments(status);
CREATE INDEX idx_community_comments_created ON public.community_comments(created_at ASC);

CREATE TRIGGER community_posts_updated_at
  BEFORE UPDATE ON public.community_posts
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER community_comments_updated_at
  BEFORE UPDATE ON public.community_comments
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- RLS
-- ============================================================================
ALTER TABLE public.community_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_comments ENABLE ROW LEVEL SECURITY;

-- Public feed can read active posts only.
CREATE POLICY community_posts_select_active ON public.community_posts
  FOR SELECT USING (status = 'active');

-- Authors can see all their own posts.
CREATE POLICY community_posts_select_own ON public.community_posts
  FOR SELECT USING (author_id = public.get_my_profile_id());

-- Users can create their own posts.
CREATE POLICY community_posts_insert_own ON public.community_posts
  FOR INSERT WITH CHECK (
    author_id = public.get_my_profile_id()
    AND (
      vehicle_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.vehicles v
        WHERE v.id = vehicle_id
          AND v.owner_id = public.get_my_profile_id()
          AND v.visibility = 'public'
      )
    )
    AND (
      marketplace_listing_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.marketplace_listings ml
        WHERE ml.id = marketplace_listing_id
          AND ml.seller_id = public.get_my_profile_id()
          AND ml.status = 'active'
      )
    )
  );

-- Authors can update/archive their own posts, but cannot reassign ownership.
CREATE POLICY community_posts_update_own ON public.community_posts
  FOR UPDATE
  USING (author_id = public.get_my_profile_id())
  WITH CHECK (
    author_id = public.get_my_profile_id()
    AND (
      vehicle_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.vehicles v
        WHERE v.id = vehicle_id
          AND v.owner_id = public.get_my_profile_id()
          AND v.visibility = 'public'
      )
    )
    AND (
      marketplace_listing_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.marketplace_listings ml
        WHERE ml.id = marketplace_listing_id
          AND ml.seller_id = public.get_my_profile_id()
      )
    )
  );

-- Admin full access.
CREATE POLICY community_posts_admin ON public.community_posts
  FOR ALL USING (public.get_my_role() = 'admin');

-- Public feed can read active comments on active posts.
CREATE POLICY community_comments_select_active ON public.community_comments
  FOR SELECT USING (
    status = 'active'
    AND EXISTS (
      SELECT 1 FROM public.community_posts p
      WHERE p.id = community_comments.post_id
        AND p.status = 'active'
    )
  );

-- Comment authors can see all their own comments.
CREATE POLICY community_comments_select_own ON public.community_comments
  FOR SELECT USING (author_id = public.get_my_profile_id());

-- Users can comment on active posts.
CREATE POLICY community_comments_insert_own ON public.community_comments
  FOR INSERT WITH CHECK (
    author_id = public.get_my_profile_id()
    AND EXISTS (
      SELECT 1 FROM public.community_posts p
      WHERE p.id = community_comments.post_id
        AND p.status = 'active'
    )
  );

-- Comment authors can archive/edit their own comments, but cannot reassign ownership.
CREATE POLICY community_comments_update_own ON public.community_comments
  FOR UPDATE
  USING (author_id = public.get_my_profile_id())
  WITH CHECK (author_id = public.get_my_profile_id());

-- Admin full access.
CREATE POLICY community_comments_admin ON public.community_comments
  FOR ALL USING (public.get_my_role() = 'admin');
