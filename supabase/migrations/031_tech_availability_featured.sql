-- Migration 031: technician service area, availability, featured, verified status
-- Adds availability/service area settings for tech portal
-- Adds featured/verified flags for admin moderation

ALTER TABLE technician_profiles
  ADD COLUMN IF NOT EXISTS service_area text,
  ADD COLUMN IF NOT EXISTS is_available boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_featured  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_verified  boolean NOT NULL DEFAULT false;

-- Index for directory queries that filter by availability / featured
CREATE INDEX IF NOT EXISTS idx_tech_profiles_is_available ON technician_profiles (is_available);
CREATE INDEX IF NOT EXISTS idx_tech_profiles_is_featured  ON technician_profiles (is_featured);
