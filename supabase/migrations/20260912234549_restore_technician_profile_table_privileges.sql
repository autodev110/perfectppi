-- RLS policies cannot authorize Data API operations until the table-level
-- privileges exist. Keep field-level trust enforcement in the existing trigger.
GRANT SELECT, UPDATE ON TABLE public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.technician_profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;
GRANT ALL ON TABLE public.technician_profiles TO service_role;
