/*
  Verwalter-Zugang fuer Verwaltung und Journal.
  Ein neues Testprojekt startet mit dem Passwort `kasse`. Das Passwort kann
  nur vom angemeldeten Test-Hauptzugang geaendert werden.
*/

INSERT INTO public.admin_gate_secrets (key, password_hash)
VALUES ('gate', extensions.crypt('kasse', extensions.gen_salt('bf')))
ON CONFLICT (key) DO UPDATE
SET password_hash = EXCLUDED.password_hash;

CREATE OR REPLACE FUNCTION public.set_admin_gate_password(p_current text, p_next text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF auth.uid() IS DISTINCT FROM (SELECT id FROM auth.users WHERE email = 'admin@kasse.local' LIMIT 1) THEN
    RAISE EXCEPTION 'Nicht berechtigt.' USING ERRCODE = '42501';
  END IF;
  IF length(p_next) < 6 THEN
    RAISE EXCEPTION 'Das neue Passwort muss mindestens 6 Zeichen haben.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.admin_gate_secrets
    WHERE key = 'gate'
      AND password_hash = extensions.crypt(lower(btrim(p_current)), password_hash)
  ) THEN
    RAISE EXCEPTION 'Das bisherige Verwalter-Passwort ist nicht korrekt.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.admin_gate_secrets
  SET password_hash = extensions.crypt(lower(btrim(p_next)), extensions.gen_salt('bf'))
  WHERE key = 'gate';
  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_admin_gate_password(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_admin_gate_password(text, text) TO authenticated;
