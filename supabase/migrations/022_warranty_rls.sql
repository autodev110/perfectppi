-- RLS policies for warranty tables (Domain D)
-- Adds docuseal_submitter_slug to contracts for fresh embed_src generation

-- ============================================================
-- Schema patch: add submitter slug column to contracts
-- ============================================================
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS docuseal_submitter_slug text;

-- ============================================================
-- Enable RLS
-- ============================================================
ALTER TABLE warranty_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE warranty_orders  ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments         ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- warranty_options
--   Consumers own their options. Admins see everything.
-- ============================================================
CREATE POLICY "consumer_select_own_warranty_options" ON warranty_options
  FOR SELECT USING (
    user_id = auth.uid()
    OR get_my_role() = 'admin'
  );

CREATE POLICY "consumer_insert_own_warranty_options" ON warranty_options
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "consumer_update_own_warranty_options" ON warranty_options
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ============================================================
-- warranty_orders
--   Consumers own orders via warranty_options.user_id.
--   Use a SECURITY DEFINER helper to avoid recursive RLS.
-- ============================================================
CREATE OR REPLACE FUNCTION get_warranty_option_user_id(option_id uuid)
  RETURNS uuid
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT user_id FROM warranty_options WHERE id = option_id;
$$;

CREATE POLICY "consumer_select_own_warranty_orders" ON warranty_orders
  FOR SELECT USING (
    get_warranty_option_user_id(warranty_option_id) = auth.uid()
    OR get_my_role() = 'admin'
  );

CREATE POLICY "consumer_insert_own_warranty_orders" ON warranty_orders
  FOR INSERT WITH CHECK (
    get_warranty_option_user_id(warranty_option_id) = auth.uid()
  );

CREATE POLICY "consumer_update_own_warranty_orders" ON warranty_orders
  FOR UPDATE USING (
    get_warranty_option_user_id(warranty_option_id) = auth.uid()
  );

-- ============================================================
-- contracts
--   Signer owns their contract row.
-- ============================================================
CREATE POLICY "consumer_select_own_contracts" ON contracts
  FOR SELECT USING (
    signer_id = auth.uid()
    OR get_my_role() = 'admin'
  );

CREATE POLICY "consumer_insert_own_contracts" ON contracts
  FOR INSERT WITH CHECK (signer_id = auth.uid());

CREATE POLICY "consumer_update_own_contracts" ON contracts
  FOR UPDATE USING (signer_id = auth.uid());

-- Service role can update contracts (webhook updates signed_at)
CREATE POLICY "service_update_contracts" ON contracts
  FOR UPDATE USING (true)
  WITH CHECK (true);

-- ============================================================
-- payments
--   User owns their payment rows.
-- ============================================================
CREATE POLICY "consumer_select_own_payments" ON payments
  FOR SELECT USING (
    user_id = auth.uid()
    OR get_my_role() = 'admin'
  );

CREATE POLICY "consumer_insert_own_payments" ON payments
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Service role can update payments (stripe webhook)
CREATE POLICY "service_update_payments" ON payments
  FOR UPDATE USING (true)
  WITH CHECK (true);
