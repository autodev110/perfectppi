-- PostgreSQL requires new enum values to commit before later migrations use
-- them in function bodies or seed rows.
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'answer_helpful';

CREATE TYPE public.community_question_outcome AS ENUM (
  'fixed',
  'helped',
  'not_fixed',
  'still_diagnosing'
);
