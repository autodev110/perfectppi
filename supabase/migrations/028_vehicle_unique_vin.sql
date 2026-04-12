-- ============================================================================
-- Migration 028: Vehicle VIN Uniqueness Guard
-- Prevent duplicate vehicles for the same owner + VIN at the database layer.
-- ============================================================================

CREATE UNIQUE INDEX idx_vehicles_owner_vin_unique
  ON public.vehicles(owner_id, upper(btrim(vin)))
  WHERE vin IS NOT NULL AND btrim(vin) <> '';
