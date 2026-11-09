-- Test project only. Export protected answer proofs, never plaintext answers
-- or the Supabase account password. Receipt identities are retained on restore.
CREATE OR REPLACE FUNCTION public.export_pos_recovery_metadata()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS DISTINCT FROM '8461bbe1-9c6f-46c4-be41-dcbcc69f8be4'::uuid THEN
    RAISE EXCEPTION 'Nicht berechtigt.' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'security', (SELECT coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) FROM public.pos_staff_security s),
    'receipts', (SELECT coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) FROM public.pos_daily_close_receipts r),
    'counters', (SELECT coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) FROM public.pos_daily_close_receipt_counters c)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_pos_recovery_metadata(p_metadata jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record;
BEGIN
  IF auth.uid() IS DISTINCT FROM '8461bbe1-9c6f-46c4-be41-dcbcc69f8be4'::uuid THEN
    RAISE EXCEPTION 'Nicht berechtigt.' USING ERRCODE = '42501';
  END IF;
  LOCK TABLE public.pos_daily_close_receipts IN ACCESS EXCLUSIVE MODE;
  LOCK TABLE public.pos_daily_close_receipt_counters IN ACCESS EXCLUSIVE MODE;
  FOR r IN SELECT * FROM jsonb_to_recordset(coalesce(p_metadata->'security', '[]'))
    AS x(staff_id uuid, question text, answer_hash text, updated_at timestamptz)
  LOOP
    IF EXISTS (SELECT 1 FROM public.pos_staff_users WHERE id = r.staff_id AND NOT deleted)
       AND r.answer_hash LIKE '$2%' THEN
      INSERT INTO public.pos_staff_security(staff_id, question, answer_hash, updated_at)
      VALUES(r.staff_id, r.question, r.answer_hash, r.updated_at)
      ON CONFLICT(staff_id) DO UPDATE SET question=excluded.question,
        answer_hash=excluded.answer_hash, updated_at=excluded.updated_at
      WHERE excluded.updated_at > pos_staff_security.updated_at;
    END IF;
  END LOOP;
  FOR r IN SELECT * FROM jsonb_to_recordset(coalesce(p_metadata->'receipts', '[]'))
    AS x(session_id text, issued_by text, issued_at timestamptz, location text, calendar_year integer, location_sequence bigint)
  LOOP
    IF EXISTS (SELECT 1 FROM public.pos_cash_sessions WHERE id=r.session_id) THEN
      IF EXISTS (SELECT 1 FROM public.pos_daily_close_receipts
        WHERE location=r.location AND calendar_year=r.calendar_year
          AND location_sequence=r.location_sequence AND session_id<>r.session_id) THEN
        RAISE EXCEPTION 'Belegnummer bereits vergeben. Wiederherstellung der Belegzuordnung abgebrochen.';
      END IF;
      INSERT INTO public.pos_daily_close_receipts(session_id, issued_by, issued_at, location, calendar_year, location_sequence)
      VALUES(r.session_id, r.issued_by, r.issued_at, r.location, r.calendar_year, r.location_sequence)
      ON CONFLICT(session_id) DO NOTHING;
    END IF;
  END LOOP;
  INSERT INTO public.pos_daily_close_receipt_counters(location, calendar_year, last_number)
    SELECT location, calendar_year, max(location_sequence) FROM public.pos_daily_close_receipts
    GROUP BY location, calendar_year
  ON CONFLICT(location, calendar_year) DO UPDATE
    SET last_number=greatest(pos_daily_close_receipt_counters.last_number, excluded.last_number);
  INSERT INTO public.pos_daily_close_receipt_counters(location, calendar_year, last_number)
    SELECT location, calendar_year, last_number FROM jsonb_to_recordset(coalesce(p_metadata->'counters', '[]'))
      AS x(location text, calendar_year integer, last_number bigint)
  ON CONFLICT(location, calendar_year) DO UPDATE
    SET last_number=greatest(pos_daily_close_receipt_counters.last_number, excluded.last_number);
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.export_pos_recovery_metadata() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.restore_pos_recovery_metadata(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.export_pos_recovery_metadata() TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_pos_recovery_metadata(jsonb) TO authenticated;
