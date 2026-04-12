-- ============================================================================
-- Migration 030: Rate My Tech Reviews
-- Parent platform module — reviewer feedback tied to completed technician PPIs
-- ============================================================================

CREATE TYPE public.review_status AS ENUM ('active', 'hidden');

ALTER TABLE public.technician_profiles
  ADD COLUMN IF NOT EXISTS avg_rating numeric(3,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_reviews integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reputation_score numeric(6,2) NOT NULL DEFAULT 0;

CREATE TABLE public.technician_reviews (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  technician_profile_id uuid NOT NULL REFERENCES public.technician_profiles(id) ON DELETE CASCADE,
  reviewer_id          uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ppi_request_id       uuid NOT NULL UNIQUE REFERENCES public.ppi_requests(id) ON DELETE CASCADE,
  rating               integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  title                text,
  content              text,
  status               public.review_status NOT NULL DEFAULT 'active',
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT technician_reviews_title_len_chk CHECK (title IS NULL OR char_length(btrim(title)) BETWEEN 1 AND 120),
  CONSTRAINT technician_reviews_content_len_chk CHECK (content IS NULL OR char_length(btrim(content)) BETWEEN 1 AND 2000)
);

CREATE INDEX idx_tech_reviews_tech_id ON public.technician_reviews(technician_profile_id);
CREATE INDEX idx_tech_reviews_reviewer_id ON public.technician_reviews(reviewer_id);
CREATE INDEX idx_tech_reviews_created_at ON public.technician_reviews(created_at DESC);
CREATE INDEX idx_tech_reviews_status ON public.technician_reviews(status);

CREATE TRIGGER technician_reviews_updated_at
  BEFORE UPDATE ON public.technician_reviews
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE OR REPLACE FUNCTION public.refresh_tech_review_aggregates(p_tech_profile_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.technician_profiles tp
  SET
    avg_rating = COALESCE(round(stats.avg_rating::numeric, 2), 0),
    total_reviews = COALESCE(stats.total_reviews, 0),
    reputation_score = COALESCE(round((stats.avg_rating * ln(stats.total_reviews + 1))::numeric, 2), 0),
    updated_at = now()
  FROM (
    SELECT
      technician_profile_id,
      AVG(rating)::numeric AS avg_rating,
      COUNT(*)::integer AS total_reviews
    FROM public.technician_reviews
    WHERE technician_profile_id = p_tech_profile_id
      AND status = 'active'
    GROUP BY technician_profile_id
  ) AS stats
  WHERE tp.id = p_tech_profile_id;

  IF NOT FOUND THEN
    UPDATE public.technician_profiles
    SET
      avg_rating = 0,
      total_reviews = 0,
      reputation_score = 0,
      updated_at = now()
    WHERE id = p_tech_profile_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.on_technician_review_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.refresh_tech_review_aggregates(OLD.technician_profile_id);
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.technician_profile_id <> NEW.technician_profile_id THEN
    PERFORM public.refresh_tech_review_aggregates(OLD.technician_profile_id);
  END IF;

  PERFORM public.refresh_tech_review_aggregates(NEW.technician_profile_id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER technician_reviews_aggregate_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.technician_reviews
  FOR EACH ROW EXECUTE FUNCTION public.on_technician_review_change();

-- ============================================================================
-- RLS
-- ============================================================================
ALTER TABLE public.technician_reviews ENABLE ROW LEVEL SECURITY;

-- Public can see active reviews for publicly visible technician profiles.
CREATE POLICY technician_reviews_select_active ON public.technician_reviews
  FOR SELECT USING (
    status = 'active'
    AND EXISTS (
      SELECT 1
      FROM public.technician_profiles tp
      JOIN public.profiles p ON p.id = tp.profile_id
      WHERE tp.id = technician_reviews.technician_profile_id
        AND p.is_public = true
    )
  );

-- Reviewer can see all of their own reviews.
CREATE POLICY technician_reviews_select_own ON public.technician_reviews
  FOR SELECT USING (reviewer_id = public.get_my_profile_id());

-- Technician can see all reviews on their profile.
CREATE POLICY technician_reviews_select_tech ON public.technician_reviews
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.technician_profiles tp
      WHERE tp.id = technician_reviews.technician_profile_id
        AND tp.profile_id = public.get_my_profile_id()
    )
  );

-- Reviewer can create one review for their own completed technician-performed request.
CREATE POLICY technician_reviews_insert_own ON public.technician_reviews
  FOR INSERT WITH CHECK (
    reviewer_id = public.get_my_profile_id()
    AND EXISTS (
      SELECT 1
      FROM public.ppi_requests pr
      JOIN public.technician_profiles tp ON tp.profile_id = pr.assigned_tech_id
      WHERE pr.id = technician_reviews.ppi_request_id
        AND pr.requester_id = public.get_my_profile_id()
        AND pr.status = 'completed'
        AND pr.assigned_tech_id IS NOT NULL
        AND tp.id = technician_reviews.technician_profile_id
    )
  );

-- Reviewer can edit only their own review.
CREATE POLICY technician_reviews_update_own ON public.technician_reviews
  FOR UPDATE
  USING (reviewer_id = public.get_my_profile_id())
  WITH CHECK (reviewer_id = public.get_my_profile_id());

-- Reviewer can delete only their own review.
CREATE POLICY technician_reviews_delete_own ON public.technician_reviews
  FOR DELETE USING (reviewer_id = public.get_my_profile_id());

-- Admin full access.
CREATE POLICY technician_reviews_admin ON public.technician_reviews
  FOR ALL USING (public.get_my_role() = 'admin');
