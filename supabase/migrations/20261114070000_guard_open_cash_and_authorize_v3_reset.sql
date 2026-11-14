-- WOODMO V3: safe cloud reset. A normal client must not hide open
-- registers or unfinalized daily closes. Password challenge is verified
-- server-side, not trusted from browser React state. No row is deleted.
-- This supersedes the legacy no-argument reset RPC without editing history.

CREATE OR REPLACE FUNCTION public.reset_pos_bookings_v3(p_admin_password text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $woodmo_safe_reset$
DECLARE
  v_at bigint;
  v_generation bigint;
  v_previous bigint;
  v_unfinished bigint;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM
     (SELECT u.id FROM auth.users u WHERE u.email='admin@kasse.local' LIMIT 1)
  THEN
    RAISE EXCEPTION 'Reset gesperrt: Cloud-Administrator erforderlich.'
      USING ERRCODE='42501';
  END IF;

  -- All devices use one Cloud identity; require the administrative gate
  -- password separately. The browser never sends a "role=admin" claim.
  IF p_admin_password IS NULL OR length(btrim(p_admin_password))=0 OR
     NOT EXISTS (
       SELECT 1 FROM public.admin_gate_secrets s
       WHERE s.key='gate' AND
             s.password_hash=extensions.crypt(lower(btrim(p_admin_password)),s.password_hash)
     )
  THEN
    RAISE EXCEPTION 'Reset gesperrt: Verwaltungs-Passwort ist nicht korrekt.'
      USING ERRCODE='42501';
  END IF;

  -- Serialize with storno and financial uploads. Reset locking must be held
  -- until the new generation is created; otherwise a concurrent checkout
  -- could be committed into a generation that just became invisible.
  PERFORM pg_advisory_xact_lock(hashtext('woodmo-v3-booking-generation-reset'));
  LOCK TABLE public.pos_transactions,public.pos_cash_sessions,public.pos_stornos
    IN SHARE ROW EXCLUSIVE MODE;
  SELECT COALESCE(max(id),0) INTO v_previous FROM public.pos_booking_resets;

  SELECT count(*) INTO v_unfinished
  FROM public.pos_cash_sessions s
  WHERE s.booking_generation=v_previous
    AND NOT (
      COALESCE((s.data->>'discarded')::boolean,false)
      OR (
        COALESCE((s.data->>'closed')::boolean,false)
        AND s.data->>'dailyCloseFinalizedAt' IS NOT NULL
        AND s.data->'dailyCloseSnapshot' IS NOT NULL
      )
    );
  IF v_unfinished>0 THEN
    RAISE EXCEPTION
      'Reset gesperrt: % Kasse(n) noch offen oder Tagesabschluss nicht endgültig. Bitte zuerst alle Kassen endgültig abschließen.',
      v_unfinished USING ERRCODE='23514';
  END IF;

  -- The existing BEFORE INSERT guard additionally verifies that no
  -- storno reference has become orphaned in ANY archived generation.
  v_at:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
  INSERT INTO public.pos_booking_resets(reset_at) VALUES(v_at)
    RETURNING id INTO v_generation;
  RETURN jsonb_build_object('reset_at',v_at,'generation',v_generation);
END;
$woodmo_safe_reset$;

-- Old clients must no longer reach an unprotected reset (or an RPC that
-- physically deletes financial evidence). Keep the old code for audit only.
REVOKE EXECUTE ON FUNCTION public.reset_pos_bookings_v3()
  FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.reset_pos_bookings_v2()
  FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.reset_pos_bookings()
  FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.reset_pos_bookings_v3(text)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.reset_pos_bookings_v3(text)
  TO authenticated;
