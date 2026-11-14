-- WOODMO V3: server-only reset gateway for administrator or manager password.
-- No historic financial records are ever deleted.
CREATE OR REPLACE FUNCTION public.reset_pos_bookings_v3_authorized()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $woodmo_reset$
DECLARE
  v_at bigint;
  v_generation bigint;
  v_previous bigint;
  v_unfinished bigint;
BEGIN
  -- SECURITY DEFINER changes current_user: check the original request JWT role.
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Reset gesperrt: Serverseitige Autorisierung erforderlich.'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('woodmo-v3-booking-generation-reset'));
  LOCK TABLE public.pos_transactions, public.pos_cash_sessions, public.pos_stornos
    IN SHARE ROW EXCLUSIVE MODE;

  SELECT COALESCE(max(id), 0) INTO v_previous FROM public.pos_booking_resets;
  SELECT count(*) INTO v_unfinished FROM public.pos_cash_sessions s
   WHERE s.booking_generation = v_previous
     AND NOT (
       COALESCE((s.data->>'discarded')::boolean, false)
       OR (
         COALESCE((s.data->>'closed')::boolean, false)
         AND s.data->>'dailyCloseFinalizedAt' IS NOT NULL
         AND s.data->'dailyCloseSnapshot' IS NOT NULL
       )
     );
  IF v_unfinished > 0 THEN
    RAISE EXCEPTION
      'Reset gesperrt: % Kasse(n) noch offen oder Tagesabschluss nicht endgültig. Bitte zuerst alle Kassen endgültig abschließen.',
      v_unfinished USING ERRCODE = '23514';
  END IF;

  -- Existing generation guard also checks for archived storno orphans.
  v_at := floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint;
  INSERT INTO public.pos_booking_resets(reset_at)
    VALUES (v_at) RETURNING id INTO v_generation;
  RETURN jsonb_build_object('reset_at', v_at, 'generation', v_generation);
END;
$woodmo_reset$;

REVOKE ALL ON FUNCTION public.reset_pos_bookings_v3_authorized()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_pos_bookings_v3_authorized()
  TO service_role;
