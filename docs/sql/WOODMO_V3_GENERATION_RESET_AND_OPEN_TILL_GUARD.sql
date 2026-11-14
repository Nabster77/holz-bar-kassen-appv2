-- WOODMO V3 ONLY: generation-based administrative test reset.
-- No automatically closing a register on dates, app restart, or reconnect.
-- Old receipts/sessions/stornos remain untouched as historical evidence in
-- their original booking_generation; only current generation is shown in the app.
BEGIN;
DROP INDEX IF EXISTS public.pos_cash_sessions_one_active_per_location_v3;
CREATE UNIQUE INDEX IF NOT EXISTS pos_cash_sessions_one_active_per_location_generation_v3
  ON public.pos_cash_sessions(location, booking_generation)
  WHERE COALESCE(data->>'closed','false') = 'false'
    AND COALESCE(data->>'discarded','false') = 'false'
    AND data->>'closedAt' IS NULL
    AND data->>'dailyCloseFinalizedAt' IS NULL
    AND data->>'dailyCloseSnapshot' IS NULL;

-- Reject stale offline UPDATEs as well as INSERTs (old-generation replays).
DROP TRIGGER IF EXISTS pos_cash_sessions_skip_before_reset ON public.pos_cash_sessions;
CREATE TRIGGER pos_cash_sessions_skip_before_reset
  BEFORE INSERT OR UPDATE ON public.pos_cash_sessions
  FOR EACH ROW EXECUTE FUNCTION public.pos_skip_bookings_before_reset();
DROP TRIGGER IF EXISTS pos_transactions_skip_before_reset ON public.pos_transactions;
CREATE TRIGGER pos_transactions_skip_before_reset
  BEFORE INSERT OR UPDATE ON public.pos_transactions
  FOR EACH ROW EXECUTE FUNCTION public.pos_skip_bookings_before_reset();
DROP TRIGGER IF EXISTS pos_stornos_skip_before_reset ON public.pos_stornos;
CREATE TRIGGER pos_stornos_skip_before_reset
  BEFORE INSERT ON public.pos_stornos
  FOR EACH ROW EXECUTE FUNCTION public.pos_skip_bookings_before_reset();

CREATE OR REPLACE FUNCTION public.reset_pos_bookings_v3()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $woodmo$
DECLARE
  v_at bigint;
  v_generation bigint;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM
     (SELECT u.id FROM auth.users u WHERE u.email = 'admin@kasse.local' LIMIT 1)
  THEN
    RAISE EXCEPTION 'Nicht berechtigt.' USING ERRCODE = '42501';
  END IF;
  -- Serializes reset calls. Old generation stays as an immutable archive;
  -- future inserts/updates with old generations are rejected by triggers.
  PERFORM pg_advisory_xact_lock(hashtext('woodmo-v3-booking-generation-reset'));
  v_at := floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint;
  INSERT INTO public.pos_booking_resets(reset_at) VALUES(v_at)
  RETURNING id INTO v_generation;
  RETURN jsonb_build_object('reset_at', v_at, 'generation', v_generation);
END;
$woodmo$;
REVOKE ALL ON FUNCTION public.reset_pos_bookings_v3() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_pos_bookings_v3() TO authenticated;
-- Prevent old V3 clients from triggering the physically destructive V2 RPC.
REVOKE EXECUTE ON FUNCTION public.reset_pos_bookings_v2() FROM PUBLIC, anon, authenticated;
COMMIT;
