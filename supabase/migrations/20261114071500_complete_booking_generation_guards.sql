-- WOODMO V3: make the generation-based open-till guard reproducible.
-- Existing docs/sql/WOODMO_V3_GENERATION_RESET_AND_OPEN_TILL_GUARD.sql
-- was deployed manually but not in the migrations chain.
-- This migration changes no cash data and fails on conflicting old rows.
DO $woodmo_open_till_check$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.pos_cash_sessions
    WHERE coalesce(data->>'closed','false')='false'
      AND coalesce(data->>'discarded','false')='false'
      AND data->>'closedAt' IS NULL
      AND data->>'dailyCloseFinalizedAt' IS NULL
      AND data->>'dailyCloseSnapshot' IS NULL
    GROUP BY location,booking_generation
    HAVING count(*)>1
  ) THEN
    RAISE EXCEPTION 'Migration blockiert: Mehrere offene Kassen am selben Standort und in derselben Generation. Erst im Journal abgleichen; keine Daten wurden verändert.';
  END IF;
END;
$woodmo_open_till_check$;

CREATE UNIQUE INDEX IF NOT EXISTS pos_cash_sessions_one_active_per_location_generation_v3
  ON public.pos_cash_sessions(location,booking_generation)
  WHERE coalesce(data->>'closed','false')='false'
    AND coalesce(data->>'discarded','false')='false'
    AND data->>'closedAt' IS NULL
    AND data->>'dailyCloseFinalizedAt' IS NULL
    AND data->>'dailyCloseSnapshot' IS NULL;

-- A previous location-only index would erroneously forbid a new clean
-- generation while an archived open register still exists.
DROP INDEX IF EXISTS public.pos_cash_sessions_one_active_per_location_v3;

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
