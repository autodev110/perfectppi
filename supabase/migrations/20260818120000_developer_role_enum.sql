-- ============================================================================
-- Migration: add 'developer' to the user_role enum
--
-- Isolated in its own migration on purpose. Postgres will not let a newly added
-- enum label be *used* by later statements in the same transaction, and the
-- Supabase CLI wraps each migration file in one. The column, guard trigger and
-- RPC that build on this value live in the next migration.
-- ============================================================================

ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'developer';
