CREATE OR REPLACE FUNCTION public.complete_warranty_signature(
  p_contract_id uuid,
  p_order_id uuid,
  p_signed_at timestamptz,
  p_document_url text
)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  UPDATE public.contracts
  SET signed_at = COALESCE(signed_at, p_signed_at),
      document_url = COALESCE(document_url, p_document_url)
  WHERE id = p_contract_id AND warranty_order_id = p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'contract_order_mismatch'; END IF;

  UPDATE public.warranty_orders
  SET status = CASE
    WHEN status IN ('payment_pending', 'paid', 'failed', 'cancelled') THEN status
    ELSE 'signed'
  END
  WHERE id = p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'warranty_order_not_found'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_warranty_payment(
  p_payment_id uuid,
  p_contract_id uuid,
  p_order_id uuid,
  p_stripe_payment_id text,
  p_receipt_url text,
  p_paid_at timestamptz
)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.contracts
    WHERE id = p_contract_id AND warranty_order_id = p_order_id
  ) THEN
    RAISE EXCEPTION 'contract_order_mismatch';
  END IF;

  UPDATE public.payments
  SET status = 'completed', stripe_payment_id = p_stripe_payment_id,
      receipt_url = p_receipt_url, paid_at = p_paid_at
  WHERE id = p_payment_id AND contract_id = p_contract_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'payment_contract_mismatch'; END IF;

  UPDATE public.warranty_orders SET status = 'paid' WHERE id = p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'warranty_order_not_found'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_warranty_payment(
  p_payment_id uuid,
  p_contract_id uuid,
  p_order_id uuid,
  p_stripe_payment_id text
)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_payment_status public.payment_status;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.contracts
    WHERE id = p_contract_id AND warranty_order_id = p_order_id
  ) THEN
    RAISE EXCEPTION 'contract_order_mismatch';
  END IF;

  SELECT status INTO v_payment_status
  FROM public.payments
  WHERE id = p_payment_id AND contract_id = p_contract_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'payment_contract_mismatch'; END IF;

  -- A delayed failure event must never overwrite a completed payment.
  IF v_payment_status = 'completed' THEN RETURN; END IF;

  UPDATE public.payments
  SET status = 'failed', stripe_payment_id = COALESCE(stripe_payment_id, p_stripe_payment_id)
  WHERE id = p_payment_id;

  UPDATE public.warranty_orders
  SET status = CASE WHEN status = 'paid' THEN status ELSE 'failed' END
  WHERE id = p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'warranty_order_not_found'; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_warranty_signature(uuid, uuid, timestamptz, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_warranty_payment(uuid, uuid, uuid, text, text, timestamptz)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_warranty_payment(uuid, uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_warranty_signature(uuid, uuid, timestamptz, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_warranty_payment(uuid, uuid, uuid, text, text, timestamptz)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_warranty_payment(uuid, uuid, uuid, text)
  TO service_role;
