-- Test project: unused openings are discarded, never finalized as receipts.
CREATE OR REPLACE FUNCTION public.discard_empty_pos_cash_session(p_session_id text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.pos_cash_sessions%ROWTYPE; v_admin uuid;
BEGIN
  SELECT id INTO v_admin FROM auth.users WHERE email='admin@kasse.local' LIMIT 1;
  IF v_admin IS NULL OR auth.uid() IS DISTINCT FROM v_admin THEN
    RAISE EXCEPTION 'Nicht berechtigt.' USING ERRCODE='42501';
  END IF;
  LOCK TABLE public.pos_transactions IN SHARE MODE;
  SELECT * INTO s FROM public.pos_cash_sessions WHERE id=p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Kassensitzung nicht gefunden. Bitte synchronisieren.'; END IF;
  IF coalesce((s.data->>'discarded')::boolean,false) THEN RETURN true; END IF;
  IF coalesce((s.data->>'closed')::boolean,false)
    OR jsonb_array_length(coalesce(s.data->'entries','[]'))>0
    OR jsonb_array_length(coalesce(s.data->'corrections','[]'))>0
    OR EXISTS (SELECT 1 FROM public.pos_daily_close_receipts WHERE session_id=p_session_id)
    OR EXISTS (SELECT 1 FROM public.pos_transactions WHERE booking_generation=s.booking_generation
      AND location=s.location AND timestamp >= (s.data->>'openedAt')::bigint) THEN
    RAISE EXCEPTION 'Die Kasse enthält Bewegungen oder ist abgeschlossen und darf nicht verworfen werden.';
  END IF;
  -- Minimal marker prevents another device or old backup reviving the opening.
  UPDATE public.pos_cash_sessions SET data=jsonb_build_object(
    'id',s.id,'location',s.location,'date',s.date,'openedAt',s.data->'openedAt',
    'openingBalance',s.data->'openingBalance','closed',true,'discarded',true,
    'entries','[]'::jsonb,'corrections','[]'::jsonb)
  WHERE id=p_session_id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.discard_empty_pos_cash_session(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.discard_empty_pos_cash_session(text) TO authenticated;
