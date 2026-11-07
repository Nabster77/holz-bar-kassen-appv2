-- Testprojekt: Behebt das vollständige Zurücksetzen der Mitarbeiter-Sicherheitsdaten.
-- Die explizite WHERE-Bedingung ist erforderlich, wenn die Datenbank sichere
-- Löschabfragen erzwingt. Katalogdaten werden von dieser Migration nicht berührt.

CREATE OR REPLACE FUNCTION public.remove_all_staff_security()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin uuid;
BEGIN
  SELECT id INTO v_admin
  FROM auth.users
  WHERE email = 'admin@kasse.local'
  LIMIT 1;

  IF auth.uid() IS DISTINCT FROM v_admin THEN
    RAISE EXCEPTION 'Nicht berechtigt.' USING ERRCODE = '42501';
  END IF;

  -- Nicht ohne WHERE löschen: Dies bleibt mit der Safe-Delete-Regel kompatibel.
  DELETE FROM public.pos_staff_security
  WHERE staff_id IS NOT NULL;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.remove_all_staff_security() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_all_staff_security() TO authenticated;
