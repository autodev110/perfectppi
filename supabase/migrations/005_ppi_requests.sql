-- PPI Requests: branching intake wizard output
-- Status state machine drives the lifecycle

CREATE TYPE ppi_request_status AS ENUM (
  'draft',
  'pending_assignment',
  'assigned',
  'accepted',
  'in_progress',
  'submitted',
  'needs_revision',
  'completed',
  'archived'
);

CREATE TYPE ppi_type AS ENUM (
  'personal',
  'general_tech',
  'certified_tech'
);

CREATE TYPE performer_type AS ENUM (
  'self',
  'technician'
);

CREATE TYPE whose_car AS ENUM (
  'own',
  'other'
);

CREATE TYPE requester_role AS ENUM (
  'buying',
  'selling',
  'documenting'
);

CREATE TABLE ppi_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  requester_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  assigned_tech_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  whose_car whose_car NOT NULL,
  requester_role requester_role NOT NULL,
  performer_type performer_type NOT NULL,
  ppi_type ppi_type NOT NULL DEFAULT 'personal',
  status ppi_request_status NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ppi_requests_requester_id_idx ON ppi_requests(requester_id);
CREATE INDEX ppi_requests_vehicle_id_idx ON ppi_requests(vehicle_id);
CREATE INDEX ppi_requests_assigned_tech_id_idx ON ppi_requests(assigned_tech_id);
CREATE INDEX ppi_requests_status_idx ON ppi_requests(status);

CREATE TRIGGER handle_updated_at
  BEFORE UPDATE ON ppi_requests
  FOR EACH ROW EXECUTE PROCEDURE moddatetime(updated_at);
