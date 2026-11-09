-- Test project only: delete the personal record and security proof atomically.
-- Keep only its UUID and deletion time so stale devices/backups cannot revive it.
BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_deleted_staff_erasure()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.deleted AND NOT NEW.deleted THEN
    RAISE EXCEPTION 'Dieser Benutzer wurde gelöscht. Bitte einen neuen Benutzer anlegen.';
  END IF;
  IF NEW.deleted THEN
    NEW.data := '{}'::jsonb;
    DELETE FROM public.pos_staff_security WHERE staff_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

-- Run with table-owner rights to erase the separately protected security row.
ALTER FUNCTION public.enforce_deleted_staff_erasure() SECURITY DEFINER;
REVOKE ALL ON FUNCTION public.enforce_deleted_staff_erasure() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS erase_deleted_staff_credentials ON public.pos_staff_users;
CREATE TRIGGER erase_deleted_staff_credentials
  BEFORE INSERT OR UPDATE ON public.pos_staff_users
  FOR EACH ROW EXECUTE FUNCTION public.enforce_deleted_staff_erasure();

CREATE OR REPLACE FUNCTION public.delete_pos_staff_user(p_staff_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_admin uuid;
BEGIN
  SELECT id INTO v_admin FROM auth.users WHERE email = 'admin@kasse.local' LIMIT 1;
  IF v_admin IS NULL OR auth.uid() IS DISTINCT FROM v_admin THEN
    RAISE EXCEPTION 'Nicht berechtigt.' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.pos_staff_security WHERE staff_id = p_staff_id;
  UPDATE public.pos_staff_users
    SET data = '{}'::jsonb, deleted = true,
      updated_at = floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint,
      synced_at = now()
    WHERE id = p_staff_id AND NOT deleted;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.delete_pos_staff_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_pos_staff_user(uuid) TO authenticated;

-- Also erase personal data retained by earlier versions' deletion markers.
DELETE FROM public.pos_staff_security
  WHERE staff_id IN (SELECT id FROM public.pos_staff_users WHERE deleted);
UPDATE public.pos_staff_users SET data = '{}'::jsonb WHERE deleted;
COMMIT;
