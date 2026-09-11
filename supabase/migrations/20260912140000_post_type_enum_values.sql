-- Plan 14.2 Phase 2 post types. Enum values commit here so the next
-- migration can reference them in constraints, triggers, and functions.

ALTER TYPE public.community_post_type ADD VALUE IF NOT EXISTS 'build_update';
ALTER TYPE public.community_post_type ADD VALUE IF NOT EXISTS 'maintenance';
ALTER TYPE public.community_post_type ADD VALUE IF NOT EXISTS 'before_after';
ALTER TYPE public.community_post_type ADD VALUE IF NOT EXISTS 'inspection_discussion';
ALTER TYPE public.community_post_type ADD VALUE IF NOT EXISTS 'buying_advice';
ALTER TYPE public.community_post_type ADD VALUE IF NOT EXISTS 'poll';
