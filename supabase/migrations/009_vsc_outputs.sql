-- VSC Outputs: Stage 2 — AI + knowledge base VSC coverage determination
-- INSERT-only (no UPDATE or DELETE) — immutable versioned records

CREATE TABLE vsc_outputs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ppi_submission_id uuid NOT NULL REFERENCES ppi_submissions(id) ON DELETE CASCADE,
  standardized_output_id uuid NOT NULL REFERENCES standardized_outputs(id) ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 1,
  document_url text,
  coverage_data jsonb NOT NULL DEFAULT '{}',
  generated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX vsc_outputs_submission_id_idx ON vsc_outputs(ppi_submission_id);
CREATE INDEX vsc_outputs_standardized_output_id_idx ON vsc_outputs(standardized_output_id);
