/*
  # Freeze cash sessions once the day close is booked

  Open sessions keep syncing normally. As soon as the stored session carries
  closed = true, its payload can no longer be changed, so a booked day close
  is tamper-proof in the cloud. Re-uploading the identical closed row still
  succeeds, which keeps the offline outbox idempotent.
*/

CREATE OR REPLACE FUNCTION public.pos_cash_sessions_reject_closed_edit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(OLD.data->>'closed', 'false') = 'true'
     AND (NEW.data IS DISTINCT FROM OLD.data
          OR NEW.date IS DISTINCT FROM OLD.date
          OR NEW.location IS DISTINCT FROM OLD.location) THEN
    RAISE EXCEPTION 'A closed cash session cannot be modified';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pos_cash_sessions_closed_immutable ON pos_cash_sessions;
CREATE TRIGGER pos_cash_sessions_closed_immutable
  BEFORE UPDATE ON pos_cash_sessions
  FOR EACH ROW EXECUTE FUNCTION public.pos_cash_sessions_reject_closed_edit();
