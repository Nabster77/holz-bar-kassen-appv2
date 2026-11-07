/*
  Final daily closes receive an immutable, separate sequence per location and
  calendar year. Existing receipts are retained and placed into the matching
  location/year sequence. Booking resets remove the reports but never reset a
  counter, so a receipt number is never reused.
*/

ALTER TABLE public.pos_daily_close_receipts
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS calendar_year integer,
  ADD COLUMN IF NOT EXISTS location_sequence bigint;

UPDATE public.pos_daily_close_receipts receipt
SET
  location = COALESCE(NULLIF(session.data->>'location', ''), 'Friedrichshafen'),
  calendar_year = COALESCE(NULLIF(substring(session.data->>'date' FROM 1 FOR 4), '')::integer, EXTRACT(YEAR FROM receipt.issued_at)::integer)
FROM public.pos_cash_sessions session
WHERE session.id = receipt.session_id
  AND (receipt.location IS NULL OR receipt.calendar_year IS NULL);

UPDATE public.pos_daily_close_receipts
SET location = COALESCE(location, 'Friedrichshafen'),
    calendar_year = COALESCE(calendar_year, EXTRACT(YEAR FROM issued_at)::integer)
WHERE location IS NULL OR calendar_year IS NULL;

WITH numbered AS (
  SELECT session_id,
         row_number() OVER (PARTITION BY location, calendar_year ORDER BY issued_at, receipt_number) AS sequence
  FROM public.pos_daily_close_receipts
)
UPDATE public.pos_daily_close_receipts receipt
SET location_sequence = numbered.sequence
FROM numbered
WHERE numbered.session_id = receipt.session_id
  AND receipt.location_sequence IS NULL;

ALTER TABLE public.pos_daily_close_receipts
  ALTER COLUMN location SET NOT NULL,
  ALTER COLUMN calendar_year SET NOT NULL,
  ALTER COLUMN location_sequence SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS pos_daily_close_receipts_location_year_sequence_key
  ON public.pos_daily_close_receipts (location, calendar_year, location_sequence);

CREATE TABLE IF NOT EXISTS public.pos_daily_close_receipt_counters (
  location text NOT NULL,
  calendar_year integer NOT NULL,
  last_number bigint NOT NULL,
  PRIMARY KEY (location, calendar_year)
);

INSERT INTO public.pos_daily_close_receipt_counters (location, calendar_year, last_number)
SELECT location, calendar_year, max(location_sequence)
FROM public.pos_daily_close_receipts
GROUP BY location, calendar_year
ON CONFLICT (location, calendar_year) DO UPDATE
SET last_number = GREATEST(public.pos_daily_close_receipt_counters.last_number, EXCLUDED.last_number);

DROP FUNCTION IF EXISTS public.issue_pos_daily_close_receipt(text, text);

CREATE OR REPLACE FUNCTION public.issue_pos_daily_close_receipt(
  p_session_id text,
  p_staff_name text,
  p_location text,
  p_close_date date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sequence bigint;
  v_location text;
  v_year integer;
  v_existing public.pos_daily_close_receipts%ROWTYPE;
BEGIN
  IF auth.uid() IS DISTINCT FROM '8461bbe1-9c6f-46c4-be41-dcbcc69f8be4'::uuid THEN
    RAISE EXCEPTION 'Nicht berechtigt.' USING ERRCODE = '42501';
  END IF;
  IF p_location NOT IN ('Friedrichshafen', 'Bregenz') OR p_close_date IS NULL THEN
    RAISE EXCEPTION 'Ungültiger Standort oder Abschlusstag.';
  END IF;

  SELECT * INTO v_existing FROM public.pos_daily_close_receipts WHERE session_id = p_session_id;
  IF FOUND THEN
    RETURN jsonb_build_object('number', v_existing.location_sequence, 'location', v_existing.location, 'year', v_existing.calendar_year);
  END IF;

  v_location := p_location;
  v_year := EXTRACT(YEAR FROM p_close_date)::integer;
  INSERT INTO public.pos_daily_close_receipt_counters (location, calendar_year, last_number)
  VALUES (v_location, v_year, 1)
  ON CONFLICT (location, calendar_year) DO UPDATE
  SET last_number = public.pos_daily_close_receipt_counters.last_number + 1
  RETURNING last_number INTO v_sequence;

  INSERT INTO public.pos_daily_close_receipts (session_id, issued_by, location, calendar_year, location_sequence)
  VALUES (p_session_id, COALESCE(NULLIF(trim(p_staff_name), ''), 'Unbekannt'), v_location, v_year, v_sequence);

  RETURN jsonb_build_object('number', v_sequence, 'location', v_location, 'year', v_year);
END;
$$;

REVOKE ALL ON FUNCTION public.issue_pos_daily_close_receipt(text, text, text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.issue_pos_daily_close_receipt(text, text, text, date) TO authenticated;

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

  DELETE FROM public.pos_daily_close_receipts WHERE session_id IS NOT NULL;
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
