-- ============================================================================
-- Atomically exchange a one-time DealerSpace user-link code for a durable link.
--
-- The previous application-level sequence consumed the code before revoking
-- and inserting the link. A later database error therefore left the code spent
-- without a link. Keeping every mutation here makes the exchange all-or-none.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.partner_exchange_user_link(
  p_connection_id uuid,
  p_transaction_id uuid,
  p_authorization_code_hash text
)
RETURNS TABLE (
  external_user_id text,
  profile_id uuid,
  linked_at timestamptz,
  status text
)
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_transaction public.partner_user_link_transactions;
  v_connection public.partner_connections;
  v_profile_role public.user_role;
  v_profile_organization_id uuid;
  v_external_user_id text;
  v_profile_id uuid;
  v_linked_at timestamptz;
  v_status text;
BEGIN
  SELECT transaction_row.* INTO v_transaction
  FROM public.partner_user_link_transactions AS transaction_row
  WHERE transaction_row.id = p_transaction_id
    AND transaction_row.partner_connection_id = p_connection_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_transaction.status <> 'authorized'
     OR v_transaction.authorization_code_hash IS NULL
     OR v_transaction.authorized_profile_id IS NULL
     OR v_transaction.authorization_code_hash IS DISTINCT FROM p_authorization_code_hash THEN
    RAISE EXCEPTION 'invalid_authorization_code';
  END IF;

  IF v_transaction.code_expires_at IS NULL
     OR v_transaction.code_expires_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'authorization_expired';
  END IF;

  -- Serializing exchanges for a connection also prevents two simultaneous
  -- relinks from racing against the partial unique indexes on active links.
  SELECT connection_row.* INTO v_connection
  FROM public.partner_connections AS connection_row
  WHERE connection_row.id = p_connection_id
  FOR UPDATE;

  IF NOT FOUND OR v_connection.status <> 'active' THEN
    RAISE EXCEPTION 'invalid_user_link';
  END IF;

  SELECT profile_row.role, technician_row.organization_id
  INTO v_profile_role, v_profile_organization_id
  FROM public.profiles AS profile_row
  LEFT JOIN public.technician_profiles AS technician_row
    ON technician_row.profile_id = profile_row.id
  WHERE profile_row.id = v_transaction.authorized_profile_id;

  IF NOT FOUND
     OR v_profile_role <> 'technician'
     OR v_profile_organization_id IS DISTINCT FROM v_connection.organization_id THEN
    RAISE EXCEPTION 'invalid_user_link';
  END IF;

  UPDATE public.partner_user_links AS link_row
  SET status = 'revoked', revoked_at = statement_timestamp()
  WHERE link_row.partner_connection_id = p_connection_id
    AND link_row.status = 'active'
    AND (
      link_row.external_user_id = v_transaction.external_user_id
      OR link_row.profile_id = v_transaction.authorized_profile_id
    );

  INSERT INTO public.partner_user_links (
    partner_connection_id,
    external_user_id,
    profile_id,
    linked_at,
    last_verified_at
  ) VALUES (
    p_connection_id,
    v_transaction.external_user_id,
    v_transaction.authorized_profile_id,
    statement_timestamp(),
    statement_timestamp()
  )
  RETURNING
    partner_user_links.external_user_id,
    partner_user_links.profile_id,
    partner_user_links.linked_at,
    partner_user_links.status
  INTO v_external_user_id, v_profile_id, v_linked_at, v_status;

  UPDATE public.partner_user_link_transactions AS transaction_row
  SET status = 'consumed', consumed_at = statement_timestamp()
  WHERE transaction_row.id = v_transaction.id;

  RETURN QUERY
    SELECT v_external_user_id, v_profile_id, v_linked_at, v_status;
END;
$$;

REVOKE ALL ON FUNCTION public.partner_exchange_user_link(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.partner_exchange_user_link(uuid, uuid, text)
  TO service_role;
