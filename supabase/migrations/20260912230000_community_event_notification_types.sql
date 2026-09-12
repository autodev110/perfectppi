-- PostgreSQL requires enum additions to commit before later migrations use
-- them in function bodies or row values.
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'event_cancelled';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'event_update';
