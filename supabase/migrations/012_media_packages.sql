-- Media Packages and Share Links

CREATE TYPE share_target_type AS ENUM (
  'media_package',
  'inspection_result',
  'standardized_output'
);

CREATE TABLE media_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  ppi_submission_id uuid REFERENCES ppi_submissions(id) ON DELETE SET NULL,
  items jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX media_packages_creator_id_idx ON media_packages(creator_id);

CREATE TABLE share_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  media_package_id uuid REFERENCES media_packages(id) ON DELETE CASCADE,
  ppi_submission_id uuid REFERENCES ppi_submissions(id) ON DELETE CASCADE,
  standardized_output_id uuid REFERENCES standardized_outputs(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  target_type share_target_type NOT NULL,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX share_links_token_idx ON share_links(token);
