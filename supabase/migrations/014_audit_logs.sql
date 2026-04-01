-- Audit trail for admin oversight

CREATE TYPE audit_action AS ENUM (
  'inspection_edited',
  'output_regenerated',
  'contract_state_changed',
  'payment_state_changed',
  'submission_resubmitted'
);

CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  action audit_action NOT NULL,
  target_type text NOT NULL,
  target_id uuid NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_logs_actor_id_idx ON audit_logs(actor_id);
CREATE INDEX audit_logs_target_id_idx ON audit_logs(target_id);
CREATE INDEX audit_logs_action_idx ON audit_logs(action);
