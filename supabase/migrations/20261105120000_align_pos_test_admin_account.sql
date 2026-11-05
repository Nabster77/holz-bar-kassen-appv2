/*
  Align the test-project POS access rules with the current test admin account.
  This is an append-only corrective migration: it does not alter bookings,
  sessions, catalog entries, images, or any other application data.
*/

-- The confirmed admin@kasse.local user in the isolated test project.
-- Do not use this migration in the main/production project.
DO $$
DECLARE
  v_admin uuid := '29866004-d8f4-4b6c-bb26-5b7cdba8e639'::uuid;
BEGIN
  DROP POLICY IF EXISTS "admin_select_pos_transactions" ON public.pos_transactions;
  DROP POLICY IF EXISTS "admin_insert_pos_transactions" ON public.pos_transactions;
  DROP POLICY IF EXISTS "admin_update_pos_transactions" ON public.pos_transactions;
  DROP POLICY IF EXISTS "admin_select_pos_cash_sessions" ON public.pos_cash_sessions;
  DROP POLICY IF EXISTS "admin_insert_pos_cash_sessions" ON public.pos_cash_sessions;
  DROP POLICY IF EXISTS "admin_update_pos_cash_sessions" ON public.pos_cash_sessions;
  DROP POLICY IF EXISTS "admin_select_pos_catalog_items" ON public.pos_catalog_items;
  DROP POLICY IF EXISTS "admin_insert_pos_catalog_items" ON public.pos_catalog_items;
  DROP POLICY IF EXISTS "admin_update_pos_catalog_items" ON public.pos_catalog_items;
  DROP POLICY IF EXISTS "admin_select_pos_booking_resets" ON public.pos_booking_resets;

  EXECUTE format('CREATE POLICY "admin_select_pos_transactions" ON public.pos_transactions FOR SELECT TO authenticated USING (auth.uid() = %L::uuid)', v_admin);
  EXECUTE format('CREATE POLICY "admin_insert_pos_transactions" ON public.pos_transactions FOR INSERT TO authenticated WITH CHECK (auth.uid() = %L::uuid)', v_admin);
  EXECUTE format('CREATE POLICY "admin_update_pos_transactions" ON public.pos_transactions FOR UPDATE TO authenticated USING (auth.uid() = %L::uuid) WITH CHECK (auth.uid() = %L::uuid)', v_admin, v_admin);

  EXECUTE format('CREATE POLICY "admin_select_pos_cash_sessions" ON public.pos_cash_sessions FOR SELECT TO authenticated USING (auth.uid() = %L::uuid)', v_admin);
  EXECUTE format('CREATE POLICY "admin_insert_pos_cash_sessions" ON public.pos_cash_sessions FOR INSERT TO authenticated WITH CHECK (auth.uid() = %L::uuid)', v_admin);
  EXECUTE format('CREATE POLICY "admin_update_pos_cash_sessions" ON public.pos_cash_sessions FOR UPDATE TO authenticated USING (auth.uid() = %L::uuid) WITH CHECK (auth.uid() = %L::uuid)', v_admin, v_admin);

  EXECUTE format('CREATE POLICY "admin_select_pos_catalog_items" ON public.pos_catalog_items FOR SELECT TO authenticated USING (auth.uid() = %L::uuid)', v_admin);
  EXECUTE format('CREATE POLICY "admin_insert_pos_catalog_items" ON public.pos_catalog_items FOR INSERT TO authenticated WITH CHECK (auth.uid() = %L::uuid)', v_admin);
  EXECUTE format('CREATE POLICY "admin_update_pos_catalog_items" ON public.pos_catalog_items FOR UPDATE TO authenticated USING (auth.uid() = %L::uuid) WITH CHECK (auth.uid() = %L::uuid)', v_admin, v_admin);

  EXECUTE format('CREATE POLICY "admin_select_pos_booking_resets" ON public.pos_booking_resets FOR SELECT TO authenticated USING (auth.uid() = %L::uuid)', v_admin);
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_pos_bookings_v2()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reset_at bigint := floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint;
  v_generation bigint;
BEGIN
  IF auth.uid() IS DISTINCT FROM '29866004-d8f4-4b6c-bb26-5b7cdba8e639'::uuid THEN
    RAISE EXCEPTION 'Nicht berechtigt.' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.pos_transactions WHERE id IS NOT NULL;
  DELETE FROM public.pos_cash_sessions WHERE id IS NOT NULL;
  INSERT INTO public.pos_booking_resets (reset_at)
  VALUES (v_reset_at)
  RETURNING id INTO v_generation;

  RETURN jsonb_build_object('reset_at', v_reset_at, 'generation', v_generation);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reset_pos_bookings_v2() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_pos_bookings_v2() TO authenticated;
