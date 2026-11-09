-- Test project: reset reports and their location/year counters atomically.
-- The next receipt starts at 1. The reset generation distinguishes reset cycles.
CREATE OR REPLACE FUNCTION public.reset_pos_bookings_v2()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reset_at bigint;
  v_generation bigint;
BEGIN
  IF auth.uid() IS DISTINCT FROM '8461bbe1-9c6f-46c4-be41-dcbcc69f8be4'::uuid THEN
    RAISE EXCEPTION 'Nicht berechtigt.' USING ERRCODE = '42501';
  END IF;

  -- Receipt issuance first reads this table. Block concurrent issuance until
  -- both receipts and counters have been cleared in this transaction.
  LOCK TABLE public.pos_daily_close_receipts IN ACCESS EXCLUSIVE MODE;
  LOCK TABLE public.pos_daily_close_receipt_counters IN ACCESS EXCLUSIVE MODE;
  v_reset_at := floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint;

  DELETE FROM public.pos_daily_close_receipts WHERE session_id IS NOT NULL;
  DELETE FROM public.pos_daily_close_receipt_counters WHERE location IS NOT NULL;
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
