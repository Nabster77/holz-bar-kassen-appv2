-- WOODMO 3.0 — STORNO-SCHEMA UND SERVER-RPC — ENTWURF, NICHT AUSFÜHREN!
-- Erst nach isolierter SQL- und Sicherheitsprüfung in eine echte Migration umwandeln.
-- Auf keinen Fall parallel zur laufenden Kasse oder automatisch im Build ausführen.
--
-- Stornos haben die LEBENSDAUER DER BUCHUNG, nicht die Lebensdauer der
-- fünf Bon-Kacheln in der Oberfläche. Lösch-/Reset-Konzept gesondert prüfen.

CREATE TABLE IF NOT EXISTS public.pos_stornos (
  id uuid PRIMARY KEY,
  original_transaction_id text NOT NULL UNIQUE,
  cash_session_id text NOT NULL,
  booking_generation bigint NOT NULL,
  location text NOT NULL CHECK (location IN ('Friedrichshafen','Bregenz')),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  employee_id uuid NOT NULL,
  employee_name text NOT NULL CHECK (length(btrim(employee_name)) > 0),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 3 AND 500),
  payment_method text NOT NULL CHECK (payment_method IN ('cash','card')),
  gross_amount_cents bigint NOT NULL,
  cash_effect_cents bigint NOT NULL,
  card_effect_cents bigint NOT NULL,
  original_receipt_snapshot jsonb NOT NULL
    CHECK (jsonb_typeof(original_receipt_snapshot) = 'object'),
  CONSTRAINT storno_effect_matches_method CHECK (
    (payment_method='cash' AND cash_effect_cents=-gross_amount_cents AND card_effect_cents=0) OR
    (payment_method='card' AND card_effect_cents=-gross_amount_cents AND cash_effect_cents=0)
  )
);

CREATE INDEX IF NOT EXISTS pos_stornos_location_recorded_idx
  ON public.pos_stornos(location,recorded_at DESC);
CREATE INDEX IF NOT EXISTS pos_stornos_session_recorded_idx
  ON public.pos_stornos(cash_session_id,recorded_at DESC);
CREATE INDEX IF NOT EXISTS pos_stornos_generation_idx
  ON public.pos_stornos(booking_generation,recorded_at DESC);

ALTER TABLE public.pos_stornos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.pos_stornos FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.pos_stornos TO authenticated;

-- As in the existing POS data policies, cloud-access is restricted to the
-- established shared cloud Admin account. Staff action authorization MUST
-- happen separately in the Edge Function, using the personal staff password.
DO $$
DECLARE v_admin uuid;
BEGIN
  SELECT id INTO v_admin FROM auth.users
    WHERE email='admin@kasse.local' LIMIT 1;
  IF v_admin IS NULL THEN
    RAISE EXCEPTION 'WOODMO: der Cloud-Admin wurde nicht gefunden';
  END IF;
  DROP POLICY IF EXISTS "v3_admin_select_pos_stornos" ON public.pos_stornos;
  EXECUTE format(
    'CREATE POLICY "v3_admin_select_pos_stornos" ON public.pos_stornos
     FOR SELECT TO authenticated USING (auth.uid() = %L::uuid)', v_admin
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.pos_stornos_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'Stornobelege dürfen nicht geändert oder gelöscht werden.'
    USING ERRCODE='42501';
END;
$$;
REVOKE ALL ON FUNCTION public.pos_stornos_immutable() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS pos_stornos_immutable_trigger ON public.pos_stornos;
CREATE TRIGGER pos_stornos_immutable_trigger
  BEFORE UPDATE OR DELETE ON public.pos_stornos
  FOR EACH ROW EXECUTE FUNCTION public.pos_stornos_immutable();

-- Grant EXECUTE exclusively to the server-side Edge Function's service role;
-- the public browser must NEVER be able to invoke this directly.
CREATE OR REPLACE FUNCTION public.create_pos_storno_v3(
  p_storno_id uuid,
  p_original_transaction_id text,
  p_cash_session_id text,
  p_staff_id uuid,
  p_reason text
)
RETURNS public.pos_stornos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $$
DECLARE
  v_existing public.pos_stornos%ROWTYPE;
  v_created public.pos_stornos%ROWTYPE;
  v_session public.pos_cash_sessions%ROWTYPE;
  v_sale public.pos_transactions%ROWTYPE;
  v_staff public.pos_staff_users%ROWTYPE;
  v_opened_at bigint;
  v_now_ms bigint;
  v_generation bigint;
  v_total_cents bigint;
  v_available_cents bigint;
  v_entries_cents bigint;
  v_cash_sales_cents bigint;
  v_existing_storno_cents bigint;
  v_payment text;
  v_topfive_ids text[];
BEGIN
  -- Only service_role receives EXECUTE rights. current_user would equal
  -- the function owner inside SECURITY DEFINER and is not an auth proof.
  IF length(btrim(coalesce(p_original_transaction_id,'')))=0 OR
     length(btrim(coalesce(p_cash_session_id,'')))=0 OR
     length(btrim(coalesce(p_reason,''))) NOT BETWEEN 3 AND 500 THEN
    RAISE EXCEPTION 'Unvollständiger Stornoantrag.';
  END IF;

  -- Serialize storno attempts for this register; freeze sales and session
  -- writes while checking the latest five and available cash.
  PERFORM pg_advisory_xact_lock(hashtextextended('woodmo-storno:'||p_cash_session_id,0));
  LOCK TABLE public.pos_transactions IN SHARE MODE;
  LOCK TABLE public.pos_cash_sessions IN SHARE MODE;

  SELECT * INTO v_existing FROM public.pos_stornos WHERE id=p_storno_id;
  IF FOUND THEN
    IF v_existing.original_transaction_id=p_original_transaction_id AND
       v_existing.cash_session_id=p_cash_session_id AND
       v_existing.employee_id=p_staff_id AND
       v_existing.reason=btrim(p_reason) THEN
      RETURN v_existing; -- duplicate request, same result, no second booking
    END IF;
    RAISE EXCEPTION 'Storno-ID bereits für eine andere Buchung benutzt.';
  END IF;

  SELECT * INTO v_session FROM public.pos_cash_sessions WHERE id=p_cash_session_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Kassensitzung nicht in der Cloud vorhanden.'; END IF;
  IF coalesce((v_session.data->>'closed')::boolean,false) OR
     coalesce((v_session.data->>'discarded')::boolean,false) OR
     v_session.data->>'closedAt' IS NOT NULL OR
     v_session.data->>'dailyCloseFinalizedAt' IS NOT NULL OR
     v_session.data->'dailyCloseSnapshot' IS NOT NULL THEN
    RAISE EXCEPTION 'Kasse ist bereits abgeschlossen. Nachträgliche Korrekturen getrennt buchen.';
  END IF;
  v_opened_at:=(v_session.data->>'openedAt')::bigint;
  v_now_ms:=(extract(epoch from clock_timestamp())*1000)::bigint;
  IF v_opened_at IS NULL THEN RAISE EXCEPTION 'Eröffnungszeit der Kasse fehlt.'; END IF;

  SELECT coalesce(max(id),0) INTO v_generation FROM public.pos_booking_resets;
  IF v_session.booking_generation<>v_generation THEN
    RAISE EXCEPTION 'Veraltete Kassengeneration; erst synchronisieren.';
  END IF;

  SELECT * INTO v_sale FROM public.pos_transactions WHERE id=p_original_transaction_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Originalbeleg noch nicht synchronisiert.'; END IF;
  IF v_sale.location<>v_session.location OR
     v_sale.booking_generation<>v_generation OR
     v_sale.timestamp<v_opened_at OR v_sale.timestamp>v_now_ms OR
     coalesce(nullif(v_sale.data->>'cashSessionId',''),p_cash_session_id)<>p_cash_session_id THEN
    RAISE EXCEPTION 'Originalbeleg gehört nicht zu dieser offenen Kasse.';
  END IF;
  v_payment:=v_sale.data->>'paymentMethod';
  IF v_payment IS NULL OR v_payment NOT IN ('cash','card') OR
     jsonb_typeof(v_sale.data->'items')<>'array' OR
     jsonb_typeof(v_sale.data->'taxByRate')<>'object' THEN
    RAISE EXCEPTION 'Originalbeleg unvollständig oder Zahlungsart unbekannt.';
  END IF;
  v_total_cents:=round(((v_sale.data->>'total')::numeric)*100)::bigint;
  IF v_total_cents IS NULL THEN RAISE EXCEPTION 'Originalbeleg ohne Gesamtbetrag.'; END IF;

  -- The five newest ORIGINAL receipts: a previously voided receipt still
  -- occupies its place; no older sale may move back into the selection.
  SELECT array_agg(t.id ORDER BY t.timestamp DESC, t.id DESC)
  INTO v_topfive_ids FROM (
    SELECT id,timestamp FROM public.pos_transactions
    WHERE location=v_session.location AND booking_generation=v_generation
      AND timestamp>=v_opened_at AND timestamp<=v_now_ms
      AND coalesce(nullif(data->>'cashSessionId',''),p_cash_session_id)=p_cash_session_id
    ORDER BY timestamp DESC,id DESC LIMIT 5
  ) AS t;
  IF NOT p_original_transaction_id=ANY(coalesce(v_topfive_ids,ARRAY[]::text[])) THEN
    RAISE EXCEPTION 'Nur die letzten fünf Einzelbons können storniert werden.';
  END IF;

  SELECT * INTO v_staff FROM public.pos_staff_users WHERE id=p_staff_id;
  IF NOT FOUND OR v_staff.deleted OR
     coalesce((v_staff.data->>'active')::boolean,false)=false OR
     v_staff.data->>'role' NOT IN ('employee','administrator') THEN
    RAISE EXCEPTION 'Mitarbeiter ist nicht für den Storno zugelassen.';
  END IF;

  -- The Edge Function MUST independently verify this employee's PBKDF2
  -- password before invoking this service-role-only RPC.
  IF EXISTS (SELECT 1 FROM public.pos_stornos
             WHERE original_transaction_id=p_original_transaction_id) THEN
    RAISE EXCEPTION 'Dieser Einzelbon wurde bereits storniert.';
  END IF;

  SELECT coalesce(sum(round(((t.data->>'total')::numeric)*100)::bigint),0)
    INTO v_cash_sales_cents
  FROM public.pos_transactions t
  WHERE t.location=v_session.location AND
        t.booking_generation=v_generation AND
        t.timestamp>=v_opened_at AND t.timestamp<=v_now_ms AND
        coalesce(nullif(t.data->>'cashSessionId',''),p_cash_session_id)=p_cash_session_id AND
        t.data->>'paymentMethod'='cash';

  SELECT coalesce(sum(
    CASE WHEN entry->>'type'='deposit'
      THEN round(((entry->>'amount')::numeric)*100)::bigint
      ELSE -round(((entry->>'amount')::numeric)*100)::bigint END
  ),0) INTO v_entries_cents
  FROM jsonb_array_elements(coalesce(v_session.data->'entries','[]'::jsonb)) AS cash_item(entry);

  SELECT coalesce(sum(cash_effect_cents),0)
    INTO v_existing_storno_cents
  FROM public.pos_stornos WHERE cash_session_id=p_cash_session_id;
  v_available_cents:=
    round(coalesce((v_session.data->>'openingBalance')::numeric,0)*100)::bigint
    + v_cash_sales_cents + v_entries_cents + v_existing_storno_cents;

  IF v_payment='cash' AND v_available_cents-v_total_cents<0 THEN
    RAISE EXCEPTION 'Storno würde negativen Bargeldbestand erzeugen.';
  END IF;

  INSERT INTO public.pos_stornos(
    id,original_transaction_id,cash_session_id,booking_generation,
    location,recorded_at,employee_id,employee_name,reason,payment_method,
    gross_amount_cents,cash_effect_cents,card_effect_cents,original_receipt_snapshot
  ) VALUES (
    p_storno_id,v_sale.id,v_session.id,v_generation,
    v_sale.location,to_timestamp(v_now_ms::numeric/1000),p_staff_id,
    v_staff.data->>'name',btrim(p_reason),v_payment,
    v_total_cents,
    CASE WHEN v_payment='cash' THEN -v_total_cents ELSE 0 END,
    CASE WHEN v_payment='card' THEN -v_total_cents ELSE 0 END,
    v_sale.data
  )
  RETURNING * INTO v_created;
  RETURN v_created;
END;
$$;

REVOKE ALL ON FUNCTION public.create_pos_storno_v3(uuid,text,text,uuid,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_pos_storno_v3(uuid,text,text,uuid,text)
  TO service_role;

-- Test with isolated fixtures before applying; there is deliberately no
-- booking reset, trigger bypass, or automatic destructive cleanup in this file.

-- SECURITY ADDENDUM (2026-11-13): a finalized cash snapshot MUST contain
-- all recorded stornos verbatim. The original RPC takes SHARE table locks;
-- an UPDATE/INSERT of pos_cash_sessions needs a conflicting ROW EXCLUSIVE
-- lock, so the write and the storno RPC cannot overtake one another.
CREATE OR REPLACE FUNCTION public.pos_storno_closed_session_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE
  v_audit_count bigint;
  v_audit_rows jsonb;
  v_storno public.pos_stornos%ROWTYPE;
  v_matches bigint;
BEGIN
  IF NOT coalesce((NEW.data->>'closed')::boolean,false) THEN RETURN NEW; END IF;

  SELECT count(*) INTO v_audit_count
  FROM public.pos_stornos
  WHERE cash_session_id=NEW.id;
  v_audit_rows:=NEW.data#>'{dailyCloseSnapshot,stornos}';

  IF v_audit_count=0 THEN
    IF jsonb_typeof(v_audit_rows)='array' AND jsonb_array_length(v_audit_rows)>0 THEN
      RAISE EXCEPTION 'Tagesabschluss enthält nicht bestätigte Stornobelege.';
    END IF;
    RETURN NEW;
  END IF;

  IF coalesce(jsonb_typeof(v_audit_rows),'null')<>'array' OR
     jsonb_array_length(v_audit_rows)<>v_audit_count THEN
    RAISE EXCEPTION 'Tagesabschluss enthält nicht alle bestätigten Stornobelege.';
  END IF;

  FOR v_storno IN
    SELECT * FROM public.pos_stornos WHERE cash_session_id=NEW.id
  LOOP
    SELECT count(*) INTO v_matches
    FROM jsonb_array_elements(v_audit_rows) AS a(record)
    WHERE a.record->>'id'=v_storno.id::text
      AND a.record->>'originalTransactionId'=v_storno.original_transaction_id
      AND a.record->>'cashSessionId'=v_storno.cash_session_id
      AND a.record->>'location'=v_storno.location
      AND a.record->>'employeeId'=v_storno.employee_id::text
      AND a.record->>'employeeName'=v_storno.employee_name
      AND a.record->>'reason'=v_storno.reason
      AND a.record->>'paymentMethod'=v_storno.payment_method
      AND round(((a.record->>'grossAmount')::numeric)*100)::bigint=v_storno.gross_amount_cents
      AND round(((a.record->>'cashEffect')::numeric)*100)::bigint=v_storno.cash_effect_cents
      AND round(((a.record->>'cardEffect')::numeric)*100)::bigint=v_storno.card_effect_cents
      AND a.record->'originalSnapshot'=v_storno.original_receipt_snapshot;
    IF v_matches<>1 THEN
      RAISE EXCEPTION 'Tagesabschluss enthält fehlerhaften oder unbestätigten Stornonachweis.';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.pos_storno_closed_session_guard() FROM PUBLIC, anon;
DROP TRIGGER IF EXISTS pos_storno_closed_session_guard_trigger ON public.pos_cash_sessions;
CREATE TRIGGER pos_storno_closed_session_guard_trigger
  BEFORE INSERT OR UPDATE ON public.pos_cash_sessions
  FOR EACH ROW EXECUTE FUNCTION public.pos_storno_closed_session_guard();

-- A booking reset must NEVER destroy an original or daily session linked to
-- a permanent storno. The reset RPC then fails atomically, rather than
-- orphaning or silently erasing finance/audit evidence.
CREATE OR REPLACE FUNCTION public.pos_storno_protect_bookings()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF TG_TABLE_NAME='pos_transactions' THEN
    IF EXISTS (SELECT 1 FROM public.pos_stornos WHERE original_transaction_id=OLD.id) THEN
      RAISE EXCEPTION 'Originalbon mit Stornobeleg darf nicht gelöscht werden.';
    END IF;
  ELSIF TG_TABLE_NAME='pos_cash_sessions' THEN
    IF EXISTS (SELECT 1 FROM public.pos_stornos WHERE cash_session_id=OLD.id) THEN
      RAISE EXCEPTION 'Kassensitzung mit Stornobeleg darf nicht gelöscht werden.';
    END IF;
  END IF;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.pos_storno_protect_bookings() FROM PUBLIC, anon;
DROP TRIGGER IF EXISTS pos_storno_transactions_retain ON public.pos_transactions;
CREATE TRIGGER pos_storno_transactions_retain
  BEFORE DELETE ON public.pos_transactions
  FOR EACH ROW EXECUTE FUNCTION public.pos_storno_protect_bookings();
DROP TRIGGER IF EXISTS pos_storno_sessions_retain ON public.pos_cash_sessions;
CREATE TRIGGER pos_storno_sessions_retain
  BEFORE DELETE ON public.pos_cash_sessions
  FOR EACH ROW EXECUTE FUNCTION public.pos_storno_protect_bookings();
