/*
  Sicherheitsfragen liegen getrennt von den sichtbaren Mitarbeiterdaten.
  Antworten werden ausschliesslich als bcrypt-Pruefwert gespeichert und sind
  weder ueber die Tabellen noch ueber die App auslesbar.
*/

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.pos_staff_security (
  staff_id uuid PRIMARY KEY REFERENCES public.pos_staff_users(id),
  question text NOT NULL CHECK (question IN ('Lieblingstier', 'Lieblingsessen', 'Lieblingsfarbe')),
  answer_hash text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pos_staff_security ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pos_staff_security FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.configure_staff_security(
  p_staff_id uuid,
  p_question text,
  p_answer text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_admin uuid;
BEGIN
  SELECT id INTO v_admin FROM auth.users WHERE email = 'admin@kasse.local' LIMIT 1;
  IF auth.uid() IS DISTINCT FROM v_admin THEN
    RAISE EXCEPTION 'Nicht berechtigt.';
  END IF;
  IF p_question NOT IN ('Lieblingstier', 'Lieblingsessen', 'Lieblingsfarbe') THEN
    RAISE EXCEPTION 'Ungültige Sicherheitsfrage.';
  END IF;
  IF length(btrim(p_answer)) < 2 THEN
    RAISE EXCEPTION 'Die Sicherheitsantwort ist zu kurz.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.pos_staff_users WHERE id = p_staff_id AND deleted = false) THEN
    RAISE EXCEPTION 'Benutzer wurde nicht gefunden.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.pos_staff_security WHERE staff_id = p_staff_id) THEN
    RAISE EXCEPTION 'Für diesen Benutzer ist bereits eine Sicherheitsfrage eingerichtet.';
  END IF;

  INSERT INTO public.pos_staff_security (staff_id, question, answer_hash, updated_at)
  VALUES (p_staff_id, p_question, crypt(lower(btrim(p_answer)), gen_salt('bf', 12)), now())
  ;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_staff_password_with_security(
  p_staff_id uuid,
  p_answer text,
  p_password_salt text,
  p_password_hash text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_admin uuid;
  v_security public.pos_staff_security%ROWTYPE;
BEGIN
  SELECT id INTO v_admin FROM auth.users WHERE email = 'admin@kasse.local' LIMIT 1;
  IF auth.uid() IS DISTINCT FROM v_admin THEN
    RAISE EXCEPTION 'Nicht berechtigt.';
  END IF;
  SELECT * INTO v_security FROM public.pos_staff_security WHERE staff_id = p_staff_id;
  IF NOT FOUND OR crypt(lower(btrim(p_answer)), v_security.answer_hash) <> v_security.answer_hash THEN
    RAISE EXCEPTION 'Die Antwort auf die Sicherheitsfrage ist nicht korrekt.';
  END IF;
  IF length(p_password_salt) < 16 OR length(p_password_hash) < 16 THEN
    RAISE EXCEPTION 'Ungültiges Passwortformat.';
  END IF;

  UPDATE public.pos_staff_users
     SET data = jsonb_set(
          jsonb_set(data, '{passwordSalt}', to_jsonb(p_password_salt), true),
          '{passwordHash}', to_jsonb(p_password_hash), true
        ) || jsonb_build_object('securityQuestion', v_security.question, 'securityConfigured', true),
         updated_at = floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint,
         synced_at = now()
   WHERE id = p_staff_id AND deleted = false;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Benutzer wurde nicht gefunden.';
  END IF;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.configure_staff_security(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reset_staff_password_with_security(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.configure_staff_security(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_staff_password_with_security(uuid, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.remove_staff_security(p_staff_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin uuid;
BEGIN
  SELECT id INTO v_admin FROM auth.users WHERE email = 'admin@kasse.local' LIMIT 1;
  IF auth.uid() IS DISTINCT FROM v_admin THEN RAISE EXCEPTION 'Nicht berechtigt.'; END IF;
  DELETE FROM public.pos_staff_security WHERE staff_id = p_staff_id;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_all_staff_security()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin uuid;
BEGIN
  SELECT id INTO v_admin FROM auth.users WHERE email = 'admin@kasse.local' LIMIT 1;
  IF auth.uid() IS DISTINCT FROM v_admin THEN RAISE EXCEPTION 'Nicht berechtigt.'; END IF;
  DELETE FROM public.pos_staff_security;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.remove_staff_security(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.remove_all_staff_security() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_staff_security(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_all_staff_security() TO authenticated;
