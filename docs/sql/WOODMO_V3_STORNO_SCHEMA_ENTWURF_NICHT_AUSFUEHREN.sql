/*
  WOODMO V3.0 – append-only storno audit foundation (STAGED, NOT APPLIED).
  This migration introduces no deletions or changes to existing bookings.
  Creation/atomicity RPC and data-flow integration follow after isolated tests.
  Never use this as proof that the Storno UI is ready.
*/

CREATE TABLE IF NOT EXISTS public.pos_stornos (
  id uuid PRIMARY KEY,
  original_transaction_id text NOT NULL UNIQUE,
  cash_session_id text NOT NULL,
  booking_generation bigint NOT NULL DEFAULT 0,
  location text NOT NULL CHECK (location IN ('Friedrichshafen', 'Bregenz')),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  employee_id uuid NOT NULL,
  employee_name text NOT NULL CHECK (length(btrim(employee_name)) > 0),
  reason text NOT NULL CHECK (length(btrim(reason)) >= 3),
  payment_method text NOT NULL CHECK (payment_method IN ('cash', 'card')),
  gross_amount_cents bigint NOT NULL,
  cash_effect_cents bigint NOT NULL,
  card_effect_cents bigint NOT NULL,
  original_receipt_snapshot jsonb NOT NULL CHECK (jsonb_typeof(original_receipt_snapshot) = 'object'),
  CONSTRAINT storno_cash_or_card_effect CHECK (
    (payment_method = 'cash' AND cash_effect_cents = -gross_amount_cents AND card_effect_cents = 0)
    OR (payment_method = 'card' AND card_effect_cents = -gross_amount_cents AND cash_effect_cents = 0)
  )
);

CREATE INDEX IF NOT EXISTS pos_stornos_location_recorded_idx
  ON public.pos_stornos (location, recorded_at DESC);
CREATE INDEX IF NOT EXISTS pos_stornos_session_idx
  ON public.pos_stornos (cash_session_id, recorded_at DESC);

ALTER TABLE public.pos_stornos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.pos_stornos FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.pos_stornos TO authenticated;

-- Shared Supabase cloud login, not a personal staff role. Staff proof must be
-- validated by the future guarded server-side create-storno RPC.
DO $$
DECLARE
  v_admin uuid;
BEGIN
  SELECT id INTO v_admin FROM auth.users WHERE email = 'admin@kasse.local' LIMIT 1;
  IF v_admin IS NULL THEN
    RAISE EXCEPTION 'WOODMO V3 Storno: shared cloud admin identity is missing.';
  END IF;
  DROP POLICY IF EXISTS "v3_admin_read_stornos" ON public.pos_stornos;
  EXECUTE format(
    'CREATE POLICY "v3_admin_read_stornos" ON public.pos_stornos FOR SELECT TO authenticated USING (auth.uid() = %L::uuid)',
    v_admin
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_pos_storno_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'Stornobuchungen sind unveränderlich. Korrekturen nur als neue nachvollziehbare Buchung.'
    USING ERRCODE = '42501';
END;
$$;
REVOKE ALL ON FUNCTION public.reject_pos_storno_changes() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS pos_stornos_immutable ON public.pos_stornos;
CREATE TRIGGER pos_stornos_immutable
  BEFORE UPDATE OR DELETE ON public.pos_stornos
  FOR EACH ROW EXECUTE FUNCTION public.reject_pos_storno_changes();

-- Deliberately no INSERT grant to client roles. Only an atomic, guarded RPC
-- may create rows after completion of the integration and concurrency tests.
