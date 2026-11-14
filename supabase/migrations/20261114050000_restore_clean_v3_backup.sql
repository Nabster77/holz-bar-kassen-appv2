-- WOODMO V3: atomic recovery of historic backups into an EMPTY active
-- generation. All original receipts, finalized sessions and stornos remain in
-- archived generations. New UUID-based IDs are prepared and validated by app.
-- No cloud data is reset, removed or overwritten by this routine.
CREATE SCHEMA IF NOT EXISTS woodmo_private;
REVOKE ALL ON SCHEMA woodmo_private FROM PUBLIC;
CREATE TABLE IF NOT EXISTS woodmo_private.pos_clean_restore_audit(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restored_at timestamptz NOT NULL DEFAULT now(),
  restored_by uuid NOT NULL,
  target_generation bigint NOT NULL,
  backup_exported_at timestamptz NOT NULL,
  financial_digest text NOT NULL,
  sales_count integer NOT NULL,
  sessions_count integer NOT NULL,
  storno_count integer NOT NULL
);
ALTER TABLE woodmo_private.pos_clean_restore_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON woodmo_private.pos_clean_restore_audit FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.restore_pos_clean_backup_v3(
  p_financial jsonb, p_expected_generation bigint, p_backup_exported_at timestamptz
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $
DECLARE
  v_generation bigint;
  v_sessions jsonb;
  v_transactions jsonb;
  v_stornos jsonb;
  v_session jsonb;
  v_transaction jsonb;
  v_storno jsonb;
  v_original jsonb;
  v_parent jsonb;
  v_prepared jsonb;
  v_audit_id uuid;
  v_sales_count integer;
  v_sessions_count integer;
  v_storno_count integer;
BEGIN
  -- Authorize on the server: the local admin modal is NOT an auth proof.
  IF auth.uid() IS DISTINCT FROM
     (SELECT u.id FROM auth.users u WHERE u.email='admin@kasse.local' LIMIT 1) THEN
    RAISE EXCEPTION 'Backup-Wiederherstellung nur mit dem Cloud-Administratorkonto erlaubt.'
      USING ERRCODE='42501';
  END IF;
  IF p_backup_exported_at IS NULL OR p_expected_generation IS NULL OR
     p_financial IS NULL OR octet_length(p_financial::text)>15000000 THEN
    RAISE EXCEPTION 'Backup-Zeitstempel oder Umfang ungültig.';
  END IF;
  v_sessions:=p_financial->'cashSessions';
  v_transactions:=p_financial->'transactions';
  v_stornos:=p_financial->'stornos';
  IF jsonb_typeof(v_sessions)<>'array' OR
     jsonb_typeof(v_transactions)<>'array' OR
     jsonb_typeof(v_stornos)<>'array' THEN
    RAISE EXCEPTION 'Finanzdaten im Backup müssen vollständige Listen sein.';
  END IF;
  v_sessions_count:=jsonb_array_length(v_sessions);
  v_sales_count:=jsonb_array_length(v_transactions);
  v_storno_count:=jsonb_array_length(v_stornos);
  IF v_sessions_count>10000 OR v_sales_count>50000 OR v_storno_count>50000 THEN
    RAISE EXCEPTION 'Backup ist für eine einzelne Transaktion zu groß. Archiv-Massenimport erforderlich.';
  END IF;
  IF (SELECT count(DISTINCT x->>'id') FROM jsonb_array_elements(v_sessions) x)<>v_sessions_count OR
     (SELECT count(DISTINCT x->>'id') FROM jsonb_array_elements(v_transactions) x)<>v_sales_count OR
     (SELECT count(DISTINCT x->>'id') FROM jsonb_array_elements(v_stornos) x)<>v_storno_count THEN
    RAISE EXCEPTION 'Backup enthält doppelte oder ungültige Beleg-IDs.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_sessions) s
    WHERE NOT coalesce((s->>'closed')::boolean,false)
      AND NOT coalesce((s->>'discarded')::boolean,false)
      AND s->>'closedAt' IS NULL AND s->>'dailyCloseFinalizedAt' IS NULL
      AND s->'dailyCloseSnapshot' IS NULL
    GROUP BY s->>'location' HAVING count(*)>1
  ) THEN
    RAISE EXCEPTION 'Konflikt: Mehrere offene Kassen am selben Standort in der Sicherung.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('woodmo-v3-booking-generation-reset'));
  -- Prevent concurrent normal sale/storno writes during the full replay.
  LOCK TABLE public.pos_transactions, public.pos_cash_sessions, public.pos_stornos
    IN SHARE ROW EXCLUSIVE MODE;
  SELECT coalesce(max(id),0) INTO v_generation FROM public.pos_booking_resets;
  IF v_generation<>p_expected_generation THEN
    RAISE EXCEPTION 'Die Kasse wurde inzwischen zurückgesetzt: Import bitte neu prüfen.';
  END IF;
  IF EXISTS(SELECT 1 FROM public.pos_transactions WHERE booking_generation=v_generation) OR
     EXISTS(SELECT 1 FROM public.pos_cash_sessions WHERE booking_generation=v_generation) OR
     EXISTS(SELECT 1 FROM public.pos_stornos WHERE booking_generation=v_generation) THEN
    RAISE EXCEPTION 'Import gesperrt: Die aktuelle Kasse enthält Buchungen oder Kassensitzungen.';
  END IF;

  FOR v_session IN SELECT value FROM jsonb_array_elements(v_sessions) LOOP
    IF jsonb_typeof(v_session)<>'object' OR
       coalesce(v_session->>'id','')='' OR
       v_session->>'location' NOT IN('Friedrichshafen','Bregenz') OR
       jsonb_typeof(v_session->'openingBalance')<>'number' OR
       (v_session->>'openingBalance')::numeric<0 OR
       jsonb_typeof(v_session->'openedAt')<>'number' OR
       NOT(v_session?'date') THEN
      RAISE EXCEPTION 'Ungültige Kassensitzung im Backup.';
    END IF;
    IF EXISTS(SELECT 1 FROM public.pos_cash_sessions WHERE id=v_session->>'id') THEN
      RAISE EXCEPTION 'Kassensitzungs-ID bereits im Archiv vergeben.';
    END IF;
  END LOOP;
  FOR v_transaction IN SELECT value FROM jsonb_array_elements(v_transactions) LOOP
    IF jsonb_typeof(v_transaction)<>'object' OR
       coalesce(v_transaction->>'id','')='' OR
       jsonb_typeof(v_transaction->'timestamp')<>'number' OR
       jsonb_typeof(v_transaction->'total')<>'number' OR
       (v_transaction->>'total')::numeric<0 OR
       v_transaction->>'paymentMethod' NOT IN('cash','card') OR
       v_transaction->>'location' NOT IN('Friedrichshafen','Bregenz') OR
       jsonb_typeof(v_transaction->'items')<>'array' OR
       jsonb_typeof(v_transaction->'taxByRate')<>'object' THEN
      RAISE EXCEPTION 'Ungültiger Originalbon im Backup.';
    END IF;
    SELECT value INTO v_parent FROM jsonb_array_elements(v_sessions)
      WHERE value->>'id'=v_transaction->>'cashSessionId';
    IF v_parent IS NULL OR v_parent->>'location'<>v_transaction->>'location' OR
       (v_transaction->>'timestamp')::numeric<(v_parent->>'openedAt')::numeric THEN
      RAISE EXCEPTION 'Buchung % hat keine passende Kassensitzung.',v_transaction->>'id';
    END IF;
    IF EXISTS(SELECT 1 FROM public.pos_transactions WHERE id=v_transaction->>'id') THEN
      RAISE EXCEPTION 'Bon-ID bereits im Archiv vergeben.';
    END IF;
  END LOOP;
  FOR v_storno IN SELECT value FROM jsonb_array_elements(v_stornos) LOOP
    IF jsonb_typeof(v_storno)<>'object' OR
       jsonb_typeof(v_storno->'originalSnapshot')<>'object' OR
       v_storno->>'paymentMethod' NOT IN('cash','card') OR
       v_storno->>'location' NOT IN('Friedrichshafen','Bregenz') OR
       length(trim(coalesce(v_storno->>'reason',''))) NOT BETWEEN 3 AND 500 THEN
      RAISE EXCEPTION 'Ungültiger Stornobeleg im Backup.';
    END IF;
    SELECT value INTO v_original FROM jsonb_array_elements(v_transactions)
      WHERE value->>'id'=v_storno->>'originalTransactionId';
    IF v_original IS NULL OR
       v_original->>'cashSessionId'<>v_storno->>'cashSessionId' OR
       v_original->>'location'<>v_storno->>'location' OR
       v_original->>'paymentMethod'<>v_storno->>'paymentMethod' OR
       v_storno->'originalSnapshot'<>v_original OR
       round((v_original->>'total')::numeric*100)<>round((v_storno->>'grossAmount')::numeric*100) OR
       round((v_storno->>'cashEffect')::numeric*100) <>
         CASE WHEN v_storno->>'paymentMethod'='cash' THEN -round((v_original->>'total')::numeric*100) ELSE 0 END OR
       round((v_storno->>'cardEffect')::numeric*100) <>
         CASE WHEN v_storno->>'paymentMethod'='card' THEN -round((v_original->>'total')::numeric*100) ELSE 0 END THEN
      RAISE EXCEPTION 'Stornobeleg % passt nicht zum Originalbon.',v_storno->>'id';
    END IF;
    IF EXISTS(SELECT 1 FROM public.pos_stornos WHERE id=(v_storno->>'id')::uuid) THEN
      RAISE EXCEPTION 'Storno-ID bereits im Archiv vergeben.';
    END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(v_stornos) s
            GROUP BY s->>'originalTransactionId' HAVING count(*)>1) THEN
    RAISE EXCEPTION 'Ein Originalbon hat mehrere Stornobelege.';
  END IF;

  -- Insert cash sessions temporarily open so finalized daily-close snapshots
  -- are only checked once all matching immutable storno records exist.
  FOR v_session IN SELECT value FROM jsonb_array_elements(v_sessions) LOOP
    v_prepared:=jsonb_set(
      v_session-'closedAt'-'dailyCloseSnapshot'-'dailyCloseFinalizedAt',
      '{closed}','false'::jsonb,true
    );
    INSERT INTO public.pos_cash_sessions(id,location,date,data,booking_generation)
      VALUES(v_session->>'id',v_session->>'location',v_session->>'date',
             v_prepared,v_generation);
  END LOOP;
  FOR v_transaction IN SELECT value FROM jsonb_array_elements(v_transactions) LOOP
    INSERT INTO public.pos_transactions(id,location,timestamp,data,booking_generation)
      VALUES(v_transaction->>'id',v_transaction->>'location',
             (v_transaction->>'timestamp')::bigint,v_transaction,v_generation);
  END LOOP;
  FOR v_storno IN SELECT value FROM jsonb_array_elements(v_stornos) LOOP
    INSERT INTO public.pos_stornos(
      id,original_transaction_id,cash_session_id,booking_generation,
      location,recorded_at,employee_id,employee_name,reason,payment_method,
      gross_amount_cents,cash_effect_cents,card_effect_cents,original_receipt_snapshot
    ) VALUES(
      (v_storno->>'id')::uuid,v_storno->>'originalTransactionId',
      v_storno->>'cashSessionId',v_generation,v_storno->>'location',
      to_timestamp((v_storno->>'timestamp')::numeric/1000),
      (v_storno->>'employeeId')::uuid,v_storno->>'employeeName',
      v_storno->>'reason',v_storno->>'paymentMethod',
      round((v_storno->>'grossAmount')::numeric*100)::bigint,
      round((v_storno->>'cashEffect')::numeric*100)::bigint,
      round((v_storno->>'cardEffect')::numeric*100)::bigint,
      v_storno->'originalSnapshot'
    );
  END LOOP;
  FOR v_session IN SELECT value FROM jsonb_array_elements(v_sessions) LOOP
    UPDATE public.pos_cash_sessions SET data=v_session
      WHERE id=v_session->>'id' AND booking_generation=v_generation;
  END LOOP;
  INSERT INTO woodmo_private.pos_clean_restore_audit(
    restored_by,target_generation,backup_exported_at,financial_digest,
    sales_count,sessions_count,storno_count
  ) VALUES(
    auth.uid(),v_generation,p_backup_exported_at,md5(p_financial::text),
    v_sales_count,v_sessions_count,v_storno_count
  ) RETURNING id INTO v_audit_id;
  RETURN jsonb_build_object(
    'generation',v_generation,'audit_id',v_audit_id,
    'transactions',v_sales_count,'cash_sessions',v_sessions_count,'stornos',v_storno_count
  );
END;
$;
REVOKE ALL ON FUNCTION public.restore_pos_clean_backup_v3(jsonb,bigint,timestamptz)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.restore_pos_clean_backup_v3(jsonb,bigint,timestamptz)
  TO authenticated;
