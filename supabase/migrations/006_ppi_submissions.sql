-- PPI Submissions: versioned, supports edit + resubmit

CREATE TYPE submission_status AS ENUM (
  'draft',
  'in_progress',
  'submitted',
  'completed'
);

CREATE TABLE ppi_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ppi_request_id uuid NOT NULL REFERENCES ppi_requests(id) ON DELETE CASCADE,
  performer_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 1,
  is_current boolean NOT NULL DEFAULT true,
  status submission_status NOT NULL DEFAULT 'draft',
  submitted_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ppi_submissions_ppi_request_id_idx ON ppi_submissions(ppi_request_id);
CREATE INDEX ppi_submissions_performer_id_idx ON ppi_submissions(performer_id);
CREATE INDEX ppi_submissions_is_current_idx ON ppi_submissions(is_current);
