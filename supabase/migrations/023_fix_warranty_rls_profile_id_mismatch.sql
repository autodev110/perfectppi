-- Fix warranty RLS identity mismatch
-- warranty_* tables store profile IDs, not auth.users IDs.
-- Policies must compare against public.get_my_profile_id(), not auth.uid().

-- ---------------------------------------------------------------------------
-- warranty_options
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "consumer_select_own_warranty_options" ON warranty_options;
DROP POLICY IF EXISTS "consumer_insert_own_warranty_options" ON warranty_options;
DROP POLICY IF EXISTS "consumer_update_own_warranty_options" ON warranty_options;

CREATE POLICY "consumer_select_own_warranty_options" ON warranty_options
  FOR SELECT USING (
    user_id = public.get_my_profile_id()
    OR public.get_my_role() = 'admin'
  );

CREATE POLICY "consumer_insert_own_warranty_options" ON warranty_options
  FOR INSERT WITH CHECK (user_id = public.get_my_profile_id());

CREATE POLICY "consumer_update_own_warranty_options" ON warranty_options
  FOR UPDATE USING (user_id = public.get_my_profile_id())
  WITH CHECK (user_id = public.get_my_profile_id());

-- ---------------------------------------------------------------------------
-- warranty_orders
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "consumer_select_own_warranty_orders" ON warranty_orders;
DROP POLICY IF EXISTS "consumer_insert_own_warranty_orders" ON warranty_orders;
DROP POLICY IF EXISTS "consumer_update_own_warranty_orders" ON warranty_orders;

CREATE POLICY "consumer_select_own_warranty_orders" ON warranty_orders
  FOR SELECT USING (
    public.get_warranty_option_user_id(warranty_option_id) = public.get_my_profile_id()
    OR public.get_my_role() = 'admin'
  );

CREATE POLICY "consumer_insert_own_warranty_orders" ON warranty_orders
  FOR INSERT WITH CHECK (
    public.get_warranty_option_user_id(warranty_option_id) = public.get_my_profile_id()
  );

CREATE POLICY "consumer_update_own_warranty_orders" ON warranty_orders
  FOR UPDATE USING (
    public.get_warranty_option_user_id(warranty_option_id) = public.get_my_profile_id()
  );

-- ---------------------------------------------------------------------------
-- contracts
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "consumer_select_own_contracts" ON contracts;
DROP POLICY IF EXISTS "consumer_insert_own_contracts" ON contracts;
DROP POLICY IF EXISTS "consumer_update_own_contracts" ON contracts;
DROP POLICY IF EXISTS "service_update_contracts" ON contracts;

CREATE POLICY "consumer_select_own_contracts" ON contracts
  FOR SELECT USING (
    signer_id = public.get_my_profile_id()
    OR public.get_my_role() = 'admin'
  );

CREATE POLICY "consumer_insert_own_contracts" ON contracts
  FOR INSERT WITH CHECK (signer_id = public.get_my_profile_id());

CREATE POLICY "consumer_update_own_contracts" ON contracts
  FOR UPDATE USING (signer_id = public.get_my_profile_id());

CREATE POLICY "service_update_contracts" ON contracts
  FOR UPDATE TO service_role
  USING (true)
  WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- payments
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "consumer_select_own_payments" ON payments;
DROP POLICY IF EXISTS "consumer_insert_own_payments" ON payments;
DROP POLICY IF EXISTS "service_update_payments" ON payments;

CREATE POLICY "consumer_select_own_payments" ON payments
  FOR SELECT USING (
    user_id = public.get_my_profile_id()
    OR public.get_my_role() = 'admin'
  );

CREATE POLICY "consumer_insert_own_payments" ON payments
  FOR INSERT WITH CHECK (user_id = public.get_my_profile_id());

CREATE POLICY "service_update_payments" ON payments
  FOR UPDATE TO service_role
  USING (true)
  WITH CHECK (true);
