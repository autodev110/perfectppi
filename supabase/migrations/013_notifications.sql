-- In-app notifications

CREATE TYPE notification_type AS ENUM (
  'tech_request_new',
  'tech_request_accepted',
  'inspection_submitted',
  'inspection_updated',
  'warranty_available',
  'payment_completed',
  'message_received'
);

CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type notification_type NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}',
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX notifications_user_id_idx ON notifications(user_id);
CREATE INDEX notifications_read_at_idx ON notifications(read_at);
