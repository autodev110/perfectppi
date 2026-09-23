BEGIN;

-- These legacy tables predate the explicit privilege model. Their RLS
-- policies do not grant table access on their own, which left fresh databases
-- dependent on manual grants before the output worker could publish reports.
REVOKE ALL ON TABLE
  public.standardized_outputs,
  public.vsc_outputs,
  public.audit_logs
FROM anon;

REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE
  public.standardized_outputs,
  public.vsc_outputs,
  public.audit_logs
FROM authenticated;

-- Existing RLS policies limit reads to authorized submissions/admins and
-- inserts to admins. Ordinary app users still cannot mutate issued outputs.
GRANT SELECT, INSERT ON TABLE public.standardized_outputs TO authenticated;
GRANT SELECT, INSERT ON TABLE public.vsc_outputs TO authenticated;
GRANT SELECT, INSERT ON TABLE public.audit_logs TO authenticated;

-- Server workers use the service-role client and need the full table-level
-- privilege set before their RLS bypass can take effect.
GRANT ALL ON TABLE public.standardized_outputs TO service_role;
GRANT ALL ON TABLE public.vsc_outputs TO service_role;
GRANT ALL ON TABLE public.audit_logs TO service_role;

COMMIT;
