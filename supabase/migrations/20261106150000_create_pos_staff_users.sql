/*
  Offline-faehige Mitarbeiter- und Administratorverwaltung fuer das isolierte
  Testprojekt. Es werden ausschliesslich Passwort-Pruefnachweise (Salt +
  PBKDF2-Hash), niemals Klartextpasswoerter, in `data` gespeichert.
*/

CREATE TABLE IF NOT EXISTS public.pos_staff_users (
  id uuid PRIMARY KEY,
  data jsonb NOT NULL,
  updated_at bigint NOT NULL,
  deleted boolean NOT NULL DEFAULT false,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pos_staff_users_updated_at_idx ON public.pos_staff_users (updated_at);

ALTER TABLE public.pos_staff_users ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.pos_staff_users TO authenticated;
REVOKE ALL ON public.pos_staff_users FROM anon;

DO $$
DECLARE
  v_admin uuid;
BEGIN
  SELECT id INTO v_admin FROM auth.users WHERE email = 'admin@kasse.local' LIMIT 1;
  IF v_admin IS NULL THEN
    RAISE EXCEPTION 'Testbenutzer admin@kasse.local wurde nicht gefunden.';
  END IF;

  DROP POLICY IF EXISTS "admin_select_pos_staff_users" ON public.pos_staff_users;
  DROP POLICY IF EXISTS "admin_insert_pos_staff_users" ON public.pos_staff_users;
  DROP POLICY IF EXISTS "admin_update_pos_staff_users" ON public.pos_staff_users;

  EXECUTE format('CREATE POLICY "admin_select_pos_staff_users" ON public.pos_staff_users FOR SELECT TO authenticated USING (auth.uid() = %L::uuid)', v_admin);
  EXECUTE format('CREATE POLICY "admin_insert_pos_staff_users" ON public.pos_staff_users FOR INSERT TO authenticated WITH CHECK (auth.uid() = %L::uuid)', v_admin);
  EXECUTE format('CREATE POLICY "admin_update_pos_staff_users" ON public.pos_staff_users FOR UPDATE TO authenticated USING (auth.uid() = %L::uuid) WITH CHECK (auth.uid() = %L::uuid)', v_admin, v_admin);
END;
$$;
