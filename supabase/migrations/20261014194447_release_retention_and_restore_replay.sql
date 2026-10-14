-- Revoked credentials and consent attempts have no further operational use.
CREATE OR REPLACE FUNCTION public.minimize_revoked_partner_connection()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.status = 'revoked' THEN
    NEW.webhook_secret_ciphertext := '';
    NEW.webhook_url := NULL;
    NEW.user_link_redirect_uri := NULL;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER partner_connections_minimize_revoked
BEFORE INSERT OR UPDATE ON public.partner_connections
FOR EACH ROW EXECUTE FUNCTION public.minimize_revoked_partner_connection();
UPDATE public.partner_connections SET status = 'revoked' WHERE status = 'revoked';
REVOKE ALL ON FUNCTION public.minimize_revoked_partner_connection() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.revoke_partner_connection(
  p_connection_id uuid, p_organization_id uuid, p_actor_id uuid
) RETURNS boolean LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  PERFORM 1 FROM public.partner_connections
    WHERE id = p_connection_id AND organization_id = p_organization_id AND status = 'active'
    FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE public.partner_connections SET status = 'revoked', revoked_at = now(), revoked_by = p_actor_id
    WHERE id = p_connection_id;
  UPDATE public.partner_user_links SET status = 'revoked', revoked_at = now(), revoked_by = p_actor_id
    WHERE partner_connection_id = p_connection_id AND status = 'active';
  UPDATE public.partner_user_link_transactions
    SET status = 'revoked', authorization_code_hash = NULL, code_expires_at = NULL
    WHERE partner_connection_id = p_connection_id AND status IN ('pending', 'authorized');
  UPDATE public.outbound_events SET status = 'failed',
    last_error = '{"category":"configuration","message":"connection revoked"}'::jsonb,
    locked_at = NULL, lock_expires_at = NULL, locked_by = NULL
    WHERE partner_connection_id = p_connection_id AND status IN ('pending', 'delivering');
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.revoke_partner_connection(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_partner_connection(uuid, uuid, uuid) TO service_role;

-- Existing audited retention administration records the approved periods.
-- No default duration: absent policy means retain. An active legal hold on
-- any organization participant conservatively preserves its partner records.
CREATE TABLE public.partner_retention_purge_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_days integer,
  link_days integer,
  deliveries_purged integer NOT NULL,
  link_transactions_purged integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.partner_retention_purge_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.partner_retention_purge_runs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.partner_retention_purge_runs TO service_role;
CREATE TRIGGER partner_retention_purge_runs_immutable BEFORE UPDATE OR DELETE ON public.partner_retention_purge_runs
FOR EACH ROW EXECUTE FUNCTION public.prevent_moderation_admin_history_mutation();
CREATE INDEX outbound_events_retention_idx ON public.outbound_events(updated_at) WHERE status IN ('delivered', 'failed');

CREATE OR REPLACE FUNCTION public.purge_partner_retention_records(p_limit integer DEFAULT 100)
RETURNS jsonb LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_delivery_days integer;
  v_link_days integer;
  v_deliveries integer := 0;
  v_links integer := 0;
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'invalid purge limit' USING ERRCODE = '22023';
  END IF;
  SELECT retention_days INTO v_delivery_days FROM public.moderation_retention_policies WHERE basis = 'partner_delivery';
  SELECT retention_days INTO v_link_days FROM public.moderation_retention_policies WHERE basis = 'partner_link_transactions';
  IF v_delivery_days IS NOT NULL THEN
    WITH candidates AS (
      SELECT event.id FROM public.outbound_events event
      JOIN public.partner_connections connection ON connection.id = event.partner_connection_id
      WHERE event.status IN ('delivered', 'failed')
        AND event.updated_at < now() - make_interval(days => v_delivery_days)
        AND NOT EXISTS (
          SELECT 1 FROM public.moderation_items item
          WHERE item.author_id = connection.connected_by AND item.status = 'legal_hold'
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.moderation_items item
          JOIN public.technician_profiles tech ON tech.profile_id = item.author_id
          WHERE tech.organization_id = connection.organization_id AND item.status = 'legal_hold'
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.moderation_items item
          JOIN public.external_inspection_refs ref ON ref.id = event.external_inspection_ref_id
          JOIN public.ppi_requests request ON request.id = ref.ppi_request_id
          WHERE item.author_id IN (request.requester_id, request.assigned_tech_id, connection.connected_by)
            AND item.status = 'legal_hold'
        )
      ORDER BY event.updated_at FOR UPDATE OF event SKIP LOCKED LIMIT p_limit
    )
    DELETE FROM public.outbound_events event USING candidates WHERE event.id = candidates.id;
    GET DIAGNOSTICS v_deliveries = ROW_COUNT;
  END IF;
  IF v_link_days IS NOT NULL THEN
    WITH candidates AS (
      SELECT link.id FROM public.partner_user_link_transactions link
      JOIN public.partner_connections connection ON connection.id = link.partner_connection_id
      WHERE link.expires_at < now() - make_interval(days => v_link_days)
        AND NOT EXISTS (SELECT 1 FROM public.moderation_items item WHERE item.author_id = link.authorized_profile_id AND item.status = 'legal_hold')
        AND NOT EXISTS (
          SELECT 1 FROM public.moderation_items item
          WHERE item.author_id = connection.connected_by AND item.status = 'legal_hold'
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.moderation_items item
          JOIN public.technician_profiles tech ON tech.profile_id = item.author_id
          WHERE tech.organization_id = connection.organization_id AND item.status = 'legal_hold'
        )
      ORDER BY link.expires_at FOR UPDATE OF link SKIP LOCKED LIMIT p_limit
    )
    DELETE FROM public.partner_user_link_transactions link USING candidates WHERE link.id = candidates.id;
    GET DIAGNOSTICS v_links = ROW_COUNT;
  END IF;
  IF v_deliveries + v_links > 0 THEN
    INSERT INTO public.partner_retention_purge_runs(delivery_days, link_days, deliveries_purged, link_transactions_purged)
      VALUES(v_delivery_days, v_link_days, v_deliveries, v_links);
  END IF;
  RETURN jsonb_build_object('deliveries', v_deliveries, 'linkTransactions', v_links);
END;
$$;
REVOKE ALL ON FUNCTION public.purge_partner_retention_records(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_partner_retention_records(integer) TO service_role;

-- Called only by the restore operator after reading an independently retained
-- private deletion journal. It recreates the ordinary held/retrying workflow.
-- The operator verifies Auth existence through the Admin API; service_role
-- deliberately has no direct SELECT/UPDATE privileges on auth.users.
CREATE OR REPLACE FUNCTION public.requeue_restored_account_deletion(
  p_request_id uuid, p_profile_id uuid, p_auth_user_id uuid, p_requested_at timestamptz
) RETURNS boolean LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_profile_id uuid;
BEGIN
  IF p_request_id IS NULL OR p_profile_id IS NULL OR p_auth_user_id IS NULL OR p_requested_at IS NULL THEN
    RAISE EXCEPTION 'invalid deletion journal' USING ERRCODE = '22023';
  END IF;
  SELECT id INTO v_profile_id FROM public.profiles WHERE auth_user_id = p_auth_user_id FOR UPDATE;
  IF v_profile_id IS NOT NULL AND v_profile_id <> p_profile_id THEN
    RAISE EXCEPTION 'deletion journal identity mismatch' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = p_profile_id AND auth_user_id <> p_auth_user_id) THEN
    RAISE EXCEPTION 'deletion journal identity mismatch' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.privacy_requests WHERE profile_id = p_profile_id
    AND request_type = 'deletion' AND status IN ('submitted', 'identity_verification', 'in_progress', 'on_hold')) THEN
    RETURN true;
  END IF;
  IF EXISTS (SELECT 1 FROM public.privacy_requests WHERE id = p_request_id
    AND subject_reference_hash <> encode(extensions.digest(p_auth_user_id::text, 'sha256'), 'hex')) THEN
    -- Existing requests may use an HMAC subject reference. Verify their
    -- recorded account identity instead of treating hash differences as proof.
    IF NOT EXISTS (SELECT 1 FROM public.privacy_requests WHERE id = p_request_id
      AND (profile_id = p_profile_id OR auth_user_id = p_auth_user_id)) THEN
      RAISE EXCEPTION 'deletion journal identity mismatch' USING ERRCODE = '22023';
    END IF;
  END IF;
  INSERT INTO public.privacy_requests(id, profile_id, auth_user_id, request_type, status, source, submitted_at, subject_reference_hash, result_metadata)
    VALUES(p_request_id, v_profile_id, p_auth_user_id, 'deletion', 'submitted', 'support', p_requested_at,
      encode(extensions.digest(p_auth_user_id::text, 'sha256'), 'hex'), jsonb_build_object('profileId', p_profile_id))
    ON CONFLICT (id) DO UPDATE SET profile_id = EXCLUDED.profile_id, auth_user_id = EXCLUDED.auth_user_id,
      request_type = 'deletion', status = 'submitted', account_deleted_at = NULL, result_metadata = EXCLUDED.result_metadata,
      next_attempt_at = now(), completed_at = NULL, retention_expires_at = NULL,
      locked_at = NULL, lock_expires_at = NULL, locked_by = NULL;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.requeue_restored_account_deletion(uuid, uuid, uuid, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.requeue_restored_account_deletion(uuid, uuid, uuid, timestamptz) TO service_role;
