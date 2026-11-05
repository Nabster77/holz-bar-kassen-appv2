/*
# Cloud reset for sales and cash sessions

1. New Tables
- `pos_booking_resets`: one row per reset of the sales journal.
  - `id` (identity, primary key)
  - `reset_at` (bigint): database time of the reset in milliseconds.
  - `created_at` (timestamptz)

2. New Functions
- `reset_pos_bookings()`: admin-only. Deletes every row of `pos_transactions` and `pos_cash_sessions` and writes a row to `pos_booking_resets`, all in one transaction. Returns `reset_at`.
- `pos_skip_bookings_before_reset()`: trigger function. Silently skips sales and cash sessions that were recorded at or before the latest reset, so devices with old local data cannot upload them again.

3. Triggers
- `pos_transactions_skip_before_reset` and `pos_cash_sessions_skip_before_reset`: BEFORE INSERT, call the trigger function above.

4. Security
- RLS enabled on `pos_booking_resets`; only the admin account may read it.
- The reset function can only be executed by the admin account. It is not callable by anon or other users.
- The trigger function is not callable by any client role.
- No DELETE privilege is granted on the sales tables.

5. Notes
- Existing rows are not changed by this migration.
- Items, categories, prices, Pfand, article history and settings are not touched.
*/

CREATE TABLE IF NOT EXISTS public.pos_booking_resets (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reset_at bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pos_booking_resets ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.pos_booking_resets TO authenticated;

DROP POLICY IF EXISTS "admin_select_pos_booking_resets" ON public.pos_booking_resets;
CREATE POLICY "admin_select_pos_booking_resets" ON public.pos_booking_resets FOR SELECT
  TO authenticated USING (auth.uid() = '8461bbe1-9c6f-46c4-be41-dcbcc69f8be4'::uuid);

CREATE OR REPLACE FUNCTION public.reset_pos_bookings()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reset_at bigint := floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint;
BEGIN
  IF auth.uid() IS DISTINCT FROM '8461bbe1-9c6f-46c4-be41-dcbcc69f8be4'::uuid THEN
    RAISE EXCEPTION 'Nicht berechtigt.' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.pos_transactions;
  DELETE FROM public.pos_cash_sessions;
  INSERT INTO public.pos_booking_resets (reset_at) VALUES (v_reset_at);

  RETURN v_reset_at;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reset_pos_bookings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_pos_bookings() TO authenticated;

CREATE OR REPLACE FUNCTION public.pos_skip_bookings_before_reset()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cutoff numeric;
  booked_at numeric;
BEGIN
  SELECT max(reset_at) INTO cutoff FROM public.pos_booking_resets;
  IF cutoff IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'pos_transactions' THEN
    booked_at := NEW.timestamp;
  ELSE
    booked_at := (NEW.data->>'openedAt')::numeric;
  END IF;

  IF booked_at IS NOT NULL AND booked_at <= cutoff THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pos_skip_bookings_before_reset() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS pos_transactions_skip_before_reset ON public.pos_transactions;
CREATE TRIGGER pos_transactions_skip_before_reset
  BEFORE INSERT ON public.pos_transactions
  FOR EACH ROW EXECUTE FUNCTION public.pos_skip_bookings_before_reset();

DROP TRIGGER IF EXISTS pos_cash_sessions_skip_before_reset ON public.pos_cash_sessions;
CREATE TRIGGER pos_cash_sessions_skip_before_reset
  BEFORE INSERT ON public.pos_cash_sessions
  FOR EACH ROW EXECUTE FUNCTION public.pos_skip_bookings_before_reset();
