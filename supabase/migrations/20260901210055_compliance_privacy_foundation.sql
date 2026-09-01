-- Versioned legal assent and privacy-rights request foundation.
-- Writes are server-mediated so request evidence cannot be forged by changing
-- a browser payload or writing directly through the Data API.

CREATE TABLE public.legal_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  document_type text NOT NULL CHECK (document_type IN ('terms')),
  document_version text NOT NULL CHECK (char_length(document_version) BETWEEN 1 AND 100),
  document_hash text NOT NULL CHECK (document_hash ~ '^[a-f0-9]{64}$'),
  source text NOT NULL CHECK (source IN ('web_signup', 'web_oauth', 'ios_signup', 'ios_oauth', 'reauth')),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(evidence) = 'object'),
  accepted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, document_type, document_version)
);

CREATE INDEX legal_acceptances_profile_idx
  ON public.legal_acceptances(profile_id, accepted_at DESC);

ALTER TABLE public.legal_acceptances ENABLE ROW LEVEL SECURITY;

CREATE POLICY legal_acceptances_select_own
  ON public.legal_acceptances
  FOR SELECT
  TO authenticated
  USING (profile_id = (SELECT public.get_my_profile_id()));

GRANT SELECT ON public.legal_acceptances TO authenticated;
GRANT ALL ON public.legal_acceptances TO service_role;

CREATE TABLE public.privacy_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  request_type text NOT NULL CHECK (request_type IN (
    'access', 'correction', 'export', 'deletion', 'opt_out',
    'appeal', 'authorized_agent', 'other'
  )),
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN (
    'submitted', 'identity_verification', 'in_progress', 'completed',
    'partially_completed', 'denied', 'cancelled'
  )),
  source text NOT NULL CHECK (source IN ('web', 'ios', 'support', 'authorized_agent')),
  details text CHECK (details IS NULL OR char_length(details) <= 2000),
  resolution_summary text CHECK (
    resolution_summary IS NULL OR char_length(resolution_summary) <= 4000
  ),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX privacy_requests_profile_idx
  ON public.privacy_requests(profile_id, submitted_at DESC);
CREATE INDEX privacy_requests_queue_idx
  ON public.privacy_requests(status, submitted_at ASC);
CREATE UNIQUE INDEX privacy_requests_one_open_deletion_idx
  ON public.privacy_requests(profile_id)
  WHERE request_type = 'deletion'
    AND status IN ('submitted', 'identity_verification', 'in_progress');

CREATE TRIGGER privacy_requests_updated_at
  BEFORE UPDATE ON public.privacy_requests
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.privacy_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY privacy_requests_select_own
  ON public.privacy_requests
  FOR SELECT
  TO authenticated
  USING (profile_id = (SELECT public.get_my_profile_id()));

GRANT SELECT ON public.privacy_requests TO authenticated;
GRANT ALL ON public.privacy_requests TO service_role;
