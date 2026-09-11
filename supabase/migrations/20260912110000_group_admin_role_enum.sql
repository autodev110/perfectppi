-- Plan 13.4 advanced roles. The enum value must commit before the next
-- migration references it in function bodies and constraints.

ALTER TYPE public.community_group_role ADD VALUE IF NOT EXISTS 'admin';
