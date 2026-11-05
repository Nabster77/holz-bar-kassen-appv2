/*
  # Make uploaded sales immutable

  A sale that has reached the cloud must not be editable. The app re-uploads
  identical rows during its one-off backfill, so an identical upsert has to
  keep working; only a real change to the financial payload is rejected.
*/

CREATE OR REPLACE FUNCTION public.pos_transactions_reject_edit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.data IS DISTINCT FROM OLD.data
     OR NEW.timestamp IS DISTINCT FROM OLD.timestamp
     OR NEW.location IS DISTINCT FROM OLD.location
     OR NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'Recorded sales cannot be modified';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pos_transactions_immutable ON pos_transactions;
CREATE TRIGGER pos_transactions_immutable
  BEFORE UPDATE ON pos_transactions
  FOR EACH ROW EXECUTE FUNCTION public.pos_transactions_reject_edit();
