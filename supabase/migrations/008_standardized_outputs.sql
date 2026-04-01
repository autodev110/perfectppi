-- Standardized Outputs: Stage 1 of the two-stage output pipeline
-- INSERT-only (no UPDATE or DELETE) — immutable versioned records

CREATE TABLE standardized_outputs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ppi_submission_id uuid NOT NULL REFERENCES ppi_submissions(id) ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 1,
  document_url text NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX standardized_outputs_submission_id_idx ON standardized_outputs(ppi_submission_id);
