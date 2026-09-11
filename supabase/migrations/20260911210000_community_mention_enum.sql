-- PostgreSQL requires a new enum value to be committed before functions and
-- policies may use it. Keep this migration separate from the mention schema.

ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'post_mention';
