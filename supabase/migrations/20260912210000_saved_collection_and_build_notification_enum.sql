-- Enum values must commit before the following migration uses them.
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'build_update';

DO $$
BEGIN
  CREATE TYPE public.saved_collection_entity_type AS ENUM (
    'post',
    'listing',
    'vehicle',
    'build'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;
