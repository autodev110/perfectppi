-- PostgreSQL requires new enum values to commit before later migrations use
-- them in function bodies or seed rows.
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'comment_reply';
