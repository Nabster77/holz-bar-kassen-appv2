/*
  Permanent, central receipt numbers for finalized daily closes.

  A session id is unique. Calling the function a second time returns the
  already issued number, which makes retried synchronization safe.
*/

CREATE TABLE IF NOT EXISTS public.pos_daily_close_receipts (
  /* No foreign key: an offline-finalized session can request its number
     before its queued cash-session row reaches the cloud. */
  session_id text PRIMARY KEY,
  receipt_number bigint GENERATED ALWAYS AS IDENTITY UNIQUE NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  issued_by text NOT NULL
);

ALTER TABLE public.pos_daily_close_receipts ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.pos_daily_close_receipts TO authenticated;

DROP POLICY IF EXISTS "admin_select_pos_daily_close_receipts" ON public.pos_daily_close_receipts;
CREATE POLICY "admin_select_pos_daily_close_receipts"
  ON public.pos_daily_close_receipts FOR SELECT TO authenticated
  USING (auth.uid() = '8461bbe1-9c6f-46c4-be41-dcbcc69f8be4'::uuid);

CREATE OR REPLACE FUNCTION public.issue_pos_daily_close_receipt(
  p_session_id text,
  p_staff_name text
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_receipt bigint;
BEGIN
  IF auth.uid() IS DISTINCT FROM '8461bbe1-9c6f-46c4-be41-dcbcc69f8be4'::uuid THEN
    RAISE EXCEPTION 'Nicht berechtigt.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.pos_daily_close_receipts (session_id, issued_by)
  VALUES (p_session_id, coalesce(nullif(trim(p_staff_name), ''), 'Unbekannt'))
  ON CONFLICT (session_id) DO UPDATE SET issued_by = public.pos_daily_close_receipts.issued_by
  RETURNING receipt_number INTO v_receipt;

  RETURN v_receipt;
END;
$$;

REVOKE ALL ON FUNCTION public.issue_pos_daily_close_receipt(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.issue_pos_daily_close_receipt(text, text) TO authenticated;
