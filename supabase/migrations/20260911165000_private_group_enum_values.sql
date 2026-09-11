-- PostgreSQL requires newly added enum values to be committed before later
-- migrations may use them. Keep these additions in their own migration so the
-- private-group schema migration always starts after that commit boundary.

ALTER TYPE public.community_group_membership_status ADD VALUE IF NOT EXISTS 'requested';
ALTER TYPE public.community_group_membership_status ADD VALUE IF NOT EXISTS 'invited';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'group_invitation';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'group_join_request';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'group_join_decision';
