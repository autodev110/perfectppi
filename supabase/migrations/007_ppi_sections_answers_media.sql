-- PPI Sections, Answers, and Inspection Media

CREATE TYPE section_type AS ENUM (
  'vehicle_basics',
  'dashboard_warnings',
  'exterior',
  'interior',
  'engine_bay',
  'tires_brakes',
  'suspension_steering',
  'fluids',
  'electrical_controls',
  'underbody',
  'road_test',
  'modifications'
);

CREATE TYPE completion_state AS ENUM (
  'not_started',
  'in_progress',
  'completed'
);

CREATE TYPE answer_type AS ENUM (
  'text',
  'yes_no',
  'select',
  'number'
);

CREATE TABLE ppi_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ppi_submission_id uuid NOT NULL REFERENCES ppi_submissions(id) ON DELETE CASCADE,
  section_type section_type NOT NULL,
  completion_state completion_state NOT NULL DEFAULT 'not_started',
  notes text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ppi_sections_submission_id_idx ON ppi_sections(ppi_submission_id);

CREATE TRIGGER handle_updated_at
  BEFORE UPDATE ON ppi_sections
  FOR EACH ROW EXECUTE PROCEDURE moddatetime(updated_at);

CREATE TABLE ppi_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ppi_section_id uuid NOT NULL REFERENCES ppi_sections(id) ON DELETE CASCADE,
  prompt text NOT NULL,
  answer_type answer_type NOT NULL DEFAULT 'text',
  answer_value text,
  options jsonb,
  is_required boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ppi_answers_section_id_idx ON ppi_answers(ppi_section_id);

CREATE TRIGGER handle_updated_at
  BEFORE UPDATE ON ppi_answers
  FOR EACH ROW EXECUTE PROCEDURE moddatetime(updated_at);

CREATE TABLE ppi_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ppi_section_id uuid NOT NULL REFERENCES ppi_sections(id) ON DELETE CASCADE,
  ppi_answer_id uuid REFERENCES ppi_answers(id) ON DELETE SET NULL,
  url text NOT NULL,
  media_type text NOT NULL CHECK (media_type IN ('image', 'video')),
  caption text,
  captured_at timestamptz,
  metadata jsonb,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ppi_media_section_id_idx ON ppi_media(ppi_section_id);
