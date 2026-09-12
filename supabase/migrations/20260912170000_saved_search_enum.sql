-- Plan 25.1 saved searches. The notification type commits here so the next
-- migration can use it inside function bodies.

ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'saved_search_match';
