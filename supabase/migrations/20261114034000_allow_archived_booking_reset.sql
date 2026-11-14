-- WOODMO V3: a reset is a generation switch, never a DELETE.
-- The 2026-11-13 storno trigger accidentally blocked all future resets
-- whenever any immutable storno record existed (even in an old generation).
-- Keep the guard but replace that blanket veto with integrity verification.
-- Historical receipts, storno evidence, and their sessions remain untouched.
CREATE OR REPLACE FUNCTION public.pos_storno_booking_reset_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $woodmo_reset$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.pos_stornos s
    LEFT JOIN public.pos_transactions t
      ON t.id = s.original_transaction_id
     AND t.booking_generation = s.booking_generation
    LEFT JOIN public.pos_cash_sessions cs
      ON cs.id = s.cash_session_id
     AND cs.booking_generation = s.booking_generation
    WHERE t.id IS NULL OR cs.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Buchungs-Reset gesperrt: Stornobeleg ohne unveränderten Originalbon oder Kassensitzung.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$woodmo_reset$;
REVOKE ALL ON FUNCTION public.pos_storno_booking_reset_guard() FROM PUBLIC, anon;
-- Existing BEFORE INSERT trigger on pos_booking_resets remains installed.
-- Original-bon/session DELETE guards, storno immutability and RLS are unchanged.
