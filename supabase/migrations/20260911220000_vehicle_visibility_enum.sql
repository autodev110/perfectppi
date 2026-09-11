-- Phase 2 Vehicle Passport privacy. PostgreSQL requires a newly added enum
-- value to commit before later migrations use it in functions or policies.

ALTER TYPE public.vehicle_visibility ADD VALUE IF NOT EXISTS 'friends';
