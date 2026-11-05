/*
  Makes a reset an explicit generation boundary instead of relying on client
  clocks. Apply this migration before deploying the matching web build.
*/

ALTER TABLE public.pos_transactions
  ADD COLUMN IF NOT EXISTS booking_generation bigint NOT NULL DEFAULT 0;

ALTER TABLE public.pos_cash_sessions
  ADD COLUMN IF NOT EXISTS booking_generation bigint NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS pos_transactions_generation_timestamp_idx
  ON public.pos_transactions (booking_generation, timestamp);

CREATE INDEX IF NOT EXISTS pos_cash_sessions_generation_id_idx
  ON public.pos_cash_sessions (booking_generation, id);

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
  IF auth.uid() IS DISTINCT FROM '8461bbe1-9c6f-46c4-be41-dcbcc69f8be4'::uuid THEN
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

CREATE OR REPLACE FUNCTION public.pos_skip_bookings_before_reset()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_generation bigint;
BEGIN
  SELECT COALESCE(max(id), 0) INTO current_generation FROM public.pos_booking_resets;
  IF NEW.booking_generation IS DISTINCT FROM current_generation THEN
    RAISE EXCEPTION 'Die Buchung stammt aus einer veralteten Kassen-Generation.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pos_transactions_skip_before_reset ON public.pos_transactions;
CREATE TRIGGER pos_transactions_skip_before_reset
  BEFORE INSERT ON public.pos_transactions
  FOR EACH ROW EXECUTE FUNCTION public.pos_skip_bookings_before_reset();

DROP TRIGGER IF EXISTS pos_cash_sessions_skip_before_reset ON public.pos_cash_sessions;
CREATE TRIGGER pos_cash_sessions_skip_before_reset
  BEFORE INSERT ON public.pos_cash_sessions
  FOR EACH ROW EXECUTE FUNCTION public.pos_skip_bookings_before_reset();
