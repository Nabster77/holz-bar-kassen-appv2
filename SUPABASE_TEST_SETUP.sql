-- Nur im Supabase-Testprojekt ausführen.
-- Erstellt die vollständige Testsstruktur inklusive Reset-Reparatur.
BEGIN;

-- ===== 20261022180518_create_article_images_bucket.sql =====
/*
# Create article-images storage bucket

## What this does
Creates a public Supabase Storage bucket named `article-images` so that
product images uploaded in the admin screen are stored server-side and
visible on every device that opens the app — not just the device that
uploaded them.

## Storage bucket
- `article-images` — public bucket (anyone can read via public URL),
  writes allowed for anon + authenticated (no sign-in in this app).

## Security
- Public read on the bucket (images are product photos, intentionally shared).
- Insert / update / delete allowed for anon + authenticated (no-auth app).
- 5 MB file size limit enforced via bucket settings.
*/

-- Create the bucket (idempotent)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('article-images', 'article-images', true, 5242880)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5242880;

-- Public read policy (anyone can view article images)
DROP POLICY IF EXISTS "public_read_article_images" ON storage.objects;
CREATE POLICY "public_read_article_images"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'article-images');

-- Allow anon + authenticated to upload
DROP POLICY IF EXISTS "anon_insert_article_images" ON storage.objects;
CREATE POLICY "anon_insert_article_images"
ON storage.objects FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'article-images');

-- Allow anon + authenticated to update (re-upload / replace)
DROP POLICY IF EXISTS "anon_update_article_images" ON storage.objects;
CREATE POLICY "anon_update_article_images"
ON storage.objects FOR UPDATE
TO anon, authenticated
USING (bucket_id = 'article-images')
WITH CHECK (bucket_id = 'article-images');

-- Allow anon + authenticated to delete
DROP POLICY IF EXISTS "anon_delete_article_images" ON storage.objects;
CREATE POLICY "anon_delete_article_images"
ON storage.objects FOR DELETE
TO anon, authenticated
USING (bucket_id = 'article-images');

-- ===== 20261029125901_create_pos_sync_tables.sql =====
/*
# Create cloud tables for POS sales and cash sessions

1. New Tables
- `pos_transactions`: one row per completed sale.
  - `id` (text, primary key) – same id the app generates locally.
  - `location` (text) – branch name.
  - `timestamp` (bigint) – sale time in milliseconds.
  - `data` (jsonb) – full sale record.
  - `synced_at` (timestamptz) – when the row reached the cloud.
- `pos_cash_sessions`: one row per cash register session (opening, entries, closing).
  - `id` (text, primary key), `location` (text), `date` (text, YYYY-MM-DD), `data` (jsonb), `synced_at` (timestamptz).

2. Security
- Row level security is enabled on both tables.
- The app has no sign-in, so the anon and authenticated roles get SELECT, INSERT and UPDATE. Rows are written by upsert, so no DELETE is granted.
- Each verb has its own policy. The data is intentionally shared across the app, as with the other tables in this project.

3. Notes
- Uploads are idempotent: the app upserts by `id`, so a retried upload never creates duplicates.
- Existing rows are never altered or removed by this migration.
*/

CREATE TABLE IF NOT EXISTS pos_transactions (
  id text PRIMARY KEY,
  location text NOT NULL,
  timestamp bigint NOT NULL,
  data jsonb NOT NULL,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pos_cash_sessions (
  id text PRIMARY KEY,
  location text NOT NULL,
  date text NOT NULL,
  data jsonb NOT NULL,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pos_transactions_location_timestamp_idx ON pos_transactions (location, timestamp);
CREATE INDEX IF NOT EXISTS pos_cash_sessions_location_date_idx ON pos_cash_sessions (location, date);

ALTER TABLE pos_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_cash_sessions ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON pos_transactions TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON pos_cash_sessions TO anon, authenticated;

DROP POLICY IF EXISTS "anon_select_pos_transactions" ON pos_transactions;
CREATE POLICY "anon_select_pos_transactions" ON pos_transactions FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_pos_transactions" ON pos_transactions;
CREATE POLICY "anon_insert_pos_transactions" ON pos_transactions FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_pos_transactions" ON pos_transactions;
CREATE POLICY "anon_update_pos_transactions" ON pos_transactions FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_select_pos_cash_sessions" ON pos_cash_sessions;
CREATE POLICY "anon_select_pos_cash_sessions" ON pos_cash_sessions FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_pos_cash_sessions" ON pos_cash_sessions;
CREATE POLICY "anon_insert_pos_cash_sessions" ON pos_cash_sessions FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_pos_cash_sessions" ON pos_cash_sessions;
CREATE POLICY "anon_update_pos_cash_sessions" ON pos_cash_sessions FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

-- ===== 20261029162548_revoke_public_read_on_pos_cloud_tables.sql =====
/*
  # Remove public read access from the cloud sales tables

  The app only uploads (upsert without returning rows); it never reads these
  tables. Read access therefore has no legitimate use and is removed so the
  public anon key cannot download the sales history.

  - Drops the SELECT policies on pos_transactions and pos_cash_sessions.
  - Revokes SELECT from anon and authenticated on both tables.
  - Revokes the unused DELETE privilege (no DELETE policy exists).
  - INSERT and UPDATE stay in place so the offline outbox keeps syncing.
*/

DROP POLICY IF EXISTS "anon_select_pos_transactions" ON pos_transactions;
DROP POLICY IF EXISTS "anon_select_pos_cash_sessions" ON pos_cash_sessions;

REVOKE SELECT, DELETE ON pos_transactions FROM anon, authenticated;
REVOKE SELECT, DELETE ON pos_cash_sessions FROM anon, authenticated;

-- ===== 20261029162607_make_pos_transactions_immutable.sql =====
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

-- ===== 20261029162626_freeze_closed_cash_sessions.sql =====
/*
  # Freeze cash sessions once the day close is booked

  Open sessions keep syncing normally. As soon as the stored session carries
  closed = true, its payload can no longer be changed, so a booked day close
  is tamper-proof in the cloud. Re-uploading the identical closed row still
  succeeds, which keeps the offline outbox idempotent.
*/

CREATE OR REPLACE FUNCTION public.pos_cash_sessions_reject_closed_edit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(OLD.data->>'closed', 'false') = 'true'
     AND (NEW.data IS DISTINCT FROM OLD.data
          OR NEW.date IS DISTINCT FROM OLD.date
          OR NEW.location IS DISTINCT FROM OLD.location) THEN
    RAISE EXCEPTION 'A closed cash session cannot be modified';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pos_cash_sessions_closed_immutable ON pos_cash_sessions;
CREATE TRIGGER pos_cash_sessions_closed_immutable
  BEFORE UPDATE ON pos_cash_sessions
  FOR EACH ROW EXECUTE FUNCTION public.pos_cash_sessions_reject_closed_edit();

-- ===== 20261029162640_remove_public_delete_on_article_images.sql =====
/*
  # Remove public delete on product images

  The app never deletes objects; replacing an image uploads a new randomly
  named file. Public delete only allowed an outsider to wipe the images.
*/

DROP POLICY IF EXISTS "anon_delete_article_images" ON storage.objects;

-- ===== 20261029162656_remove_public_overwrite_on_article_images.sql =====
/*
  # Remove public overwrite on product images

  Uploads always use a fresh random file name, so the update verb is never
  used by the app. Removing it stops an outsider from replacing the content
  behind an image URL that is already shown in the product list.
*/

DROP POLICY IF EXISTS "anon_update_article_images" ON storage.objects;

-- ===== 20261029162712_restrict_article_images_mime_types.sql =====
/*
  # Restrict the product image bucket to image uploads

  Without a mime type restriction the public bucket accepted any file,
  including HTML and SVG that would then be served from a trusted URL.
  The list matches the formats the app imports (JPEG, PNG, BMP, WebP).
*/

UPDATE storage.buckets
SET allowed_mime_types = ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/bmp', 'image/webp']
WHERE id = 'article-images';

-- ===== 20261029162732_allow_pdf_in_article_images_bucket.sql =====
/*
  # Keep PDF article imports working within the restricted bucket

  The admin screen also accepts PDF files as an image source and uploads them
  directly, so application/pdf is added back to the allowlist. HTML, SVG,
  JavaScript and every other active markup type stay rejected.
*/

UPDATE storage.buckets
SET allowed_mime_types = ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/bmp', 'image/webp', 'application/pdf']
WHERE id = 'article-images';

-- ===== 20261029170729_restrict_pos_cloud_tables_to_admin_account.sql =====
/*
# Restrict cloud sales and cash tables to the shared Admin account

1. Summary
- All tablets sign in with the shared account "admin@kasse.local".
- Only that account may read, add and update sales and cash sessions.
- Anonymous writes are removed, so the public app key can no longer add or change entries.

2. Security
- Drops the anonymous INSERT and UPDATE policies on pos_transactions and pos_cash_sessions.
- Grants SELECT, INSERT, UPDATE to the authenticated role only; anon loses all table privileges.
- New policies are bound to the Admin account's user id, so other sign-ups receive no rows.
- The immutability triggers from earlier migrations stay in place.

3. Notes
- Deletes stay impossible for everyone.
*/

REVOKE ALL ON pos_transactions FROM anon;
REVOKE ALL ON pos_cash_sessions FROM anon;

DROP POLICY IF EXISTS "anon_insert_pos_transactions" ON pos_transactions;
DROP POLICY IF EXISTS "anon_update_pos_transactions" ON pos_transactions;
DROP POLICY IF EXISTS "anon_insert_pos_cash_sessions" ON pos_cash_sessions;
DROP POLICY IF EXISTS "anon_update_pos_cash_sessions" ON pos_cash_sessions;
DROP POLICY IF EXISTS "admin_select_pos_transactions" ON pos_transactions;
DROP POLICY IF EXISTS "admin_insert_pos_transactions" ON pos_transactions;
DROP POLICY IF EXISTS "admin_update_pos_transactions" ON pos_transactions;
DROP POLICY IF EXISTS "admin_select_pos_cash_sessions" ON pos_cash_sessions;
DROP POLICY IF EXISTS "admin_insert_pos_cash_sessions" ON pos_cash_sessions;
DROP POLICY IF EXISTS "admin_update_pos_cash_sessions" ON pos_cash_sessions;

GRANT SELECT, INSERT, UPDATE ON pos_transactions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON pos_cash_sessions TO authenticated;

CREATE POLICY "admin_select_pos_transactions" ON pos_transactions FOR SELECT
  TO authenticated USING (auth.uid() = '8461bbe1-9c6f-46c4-be41-dcbcc69f8be4'::uuid);
CREATE POLICY "admin_insert_pos_transactions" ON pos_transactions FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = '8461bbe1-9c6f-46c4-be41-dcbcc69f8be4'::uuid);
CREATE POLICY "admin_update_pos_transactions" ON pos_transactions FOR UPDATE
  TO authenticated USING (auth.uid() = '8461bbe1-9c6f-46c4-be41-dcbcc69f8be4'::uuid)
  WITH CHECK (auth.uid() = '8461bbe1-9c6f-46c4-be41-dcbcc69f8be4'::uuid);

CREATE POLICY "admin_select_pos_cash_sessions" ON pos_cash_sessions FOR SELECT
  TO authenticated USING (auth.uid() = '8461bbe1-9c6f-46c4-be41-dcbcc69f8be4'::uuid);
CREATE POLICY "admin_insert_pos_cash_sessions" ON pos_cash_sessions FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = '8461bbe1-9c6f-46c4-be41-dcbcc69f8be4'::uuid);
CREATE POLICY "admin_update_pos_cash_sessions" ON pos_cash_sessions FOR UPDATE
  TO authenticated USING (auth.uid() = '8461bbe1-9c6f-46c4-be41-dcbcc69f8be4'::uuid)
  WITH CHECK (auth.uid() = '8461bbe1-9c6f-46c4-be41-dcbcc69f8be4'::uuid);

-- ===== 20261030080937_create_admin_gate_password_check.sql =====
/*
# Move the Verwaltung/Journal password check to the database

1. Summary
- The password for unlocking Verwaltung and Journal is no longer stored in the app code.
- Only a salted hash of it is kept, in a new private table `admin_gate_secrets`.
- A new function `verify_admin_gate_password(text)` answers true or false for a typed password.

2. New objects
- `admin_gate_secrets` (key text primary key, password_hash text not null).
  - Row Level Security is enabled and no policies are added, so no client role can read or change it.
  - No table privileges are granted to any client role.
- `verify_admin_gate_password(p_password text) returns boolean`.
  - Runs with the owner's rights so it can read the hash, with a fixed search path.
  - Compares the input case-insensitively and ignores surrounding spaces, as the app did before.

3. Security
- EXECUTE is revoked from PUBLIC and anon, and granted to authenticated only.
- The app already requires the shared cloud sign-in before this check is reachable.
- The stored password value is not part of this migration; it is inserted separately as a hash.
*/

CREATE TABLE IF NOT EXISTS admin_gate_secrets (
  key text PRIMARY KEY,
  password_hash text NOT NULL
);

ALTER TABLE admin_gate_secrets ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON admin_gate_secrets FROM anon, authenticated;

CREATE OR REPLACE FUNCTION verify_admin_gate_password(p_password text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_gate_secrets s
    WHERE s.key = 'gate'
      AND s.password_hash = extensions.crypt(lower(btrim(p_password)), s.password_hash)
  );
$$;

REVOKE EXECUTE ON FUNCTION verify_admin_gate_password(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION verify_admin_gate_password(text) TO authenticated;

-- ===== 20261030093212_create_pos_catalog_sync.sql =====
/*
# Cloud catalog: articles, categories and shared cash settings

1. New tables
- `pos_catalog_items`: one row per category, product or shared setting.
  - `kind` ('category' | 'product' | 'setting'), `id` (the app's own id), primary key (kind, id).
  - `data` (jsonb): the full record as the app stores it locally.
  - `updated_at` (bigint, ms): when the change was made on the device that sent it.
  - `deleted` (boolean): deletions are kept as markers so other tablets remove the item too.
  - `synced_at` (timestamptz): when the row last reached the cloud.
- `pos_catalog_history`: keeps earlier and rejected versions of catalog rows.
  - `reason` = 'replaced' (an older version was overwritten by a newer one) or 'rejected_older' (an incoming older version was not applied).
  - Nothing is deleted from this table.

2. Behaviour
- Newest change wins: an incoming row with an older `updated_at` than the stored row does not overwrite it. That incoming version is stored in the history table.
- Any overwritten version is first copied into the history table.
- Identical re-uploads change nothing.

3. Security
- Row Level Security is enabled on both new tables.
- `pos_catalog_items` is readable and writable only by the shared Admin account, the same rule as the sales tables. No DELETE is granted.
- `pos_catalog_history` has no grants and no policies for client roles. It is written only by the trigger function.
- The trigger function is not callable by client roles.

4. Notes
- Existing sales (`pos_transactions`) and cash sessions (`pos_cash_sessions`) are not changed.
- No existing rows are altered or removed.
*/

CREATE TABLE IF NOT EXISTS pos_catalog_items (
  kind text NOT NULL CHECK (kind IN ('category', 'product', 'setting')),
  id text NOT NULL,
  data jsonb NOT NULL,
  updated_at bigint NOT NULL,
  deleted boolean NOT NULL DEFAULT false,
  synced_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, id)
);

CREATE TABLE IF NOT EXISTS pos_catalog_history (
  history_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind text NOT NULL,
  id text NOT NULL,
  data jsonb NOT NULL,
  deleted boolean NOT NULL,
  updated_at bigint NOT NULL,
  reason text NOT NULL CHECK (reason IN ('replaced', 'rejected_older')),
  recorded_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE pos_catalog_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_catalog_history ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON pos_catalog_items FROM anon;
REVOKE ALL ON pos_catalog_history FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON pos_catalog_items TO authenticated;

CREATE OR REPLACE FUNCTION public.pos_catalog_items_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.data IS NOT DISTINCT FROM OLD.data
     AND NEW.deleted IS NOT DISTINCT FROM OLD.deleted
     AND NEW.updated_at IS NOT DISTINCT FROM OLD.updated_at THEN
    RETURN NEW;
  END IF;

  IF NEW.updated_at < OLD.updated_at THEN
    INSERT INTO pos_catalog_history (kind, id, data, deleted, updated_at, reason)
    VALUES (NEW.kind, NEW.id, NEW.data, NEW.deleted, NEW.updated_at, 'rejected_older');
    RETURN OLD;
  END IF;

  INSERT INTO pos_catalog_history (kind, id, data, deleted, updated_at, reason)
  VALUES (OLD.kind, OLD.id, OLD.data, OLD.deleted, OLD.updated_at, 'replaced');
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pos_catalog_items_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS pos_catalog_items_guard ON pos_catalog_items;
CREATE TRIGGER pos_catalog_items_guard
  BEFORE UPDATE ON pos_catalog_items
  FOR EACH ROW EXECUTE FUNCTION public.pos_catalog_items_guard();

DROP POLICY IF EXISTS "admin_select_pos_catalog_items" ON pos_catalog_items;
CREATE POLICY "admin_select_pos_catalog_items" ON pos_catalog_items FOR SELECT
  TO authenticated USING (auth.uid() = '8461bbe1-9c6f-46c4-be41-dcbcc69f8be4'::uuid);

DROP POLICY IF EXISTS "admin_insert_pos_catalog_items" ON pos_catalog_items;
CREATE POLICY "admin_insert_pos_catalog_items" ON pos_catalog_items FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = '8461bbe1-9c6f-46c4-be41-dcbcc69f8be4'::uuid);

DROP POLICY IF EXISTS "admin_update_pos_catalog_items" ON pos_catalog_items;
CREATE POLICY "admin_update_pos_catalog_items" ON pos_catalog_items FOR UPDATE
  TO authenticated USING (auth.uid() = '8461bbe1-9c6f-46c4-be41-dcbcc69f8be4'::uuid)
  WITH CHECK (auth.uid() = '8461bbe1-9c6f-46c4-be41-dcbcc69f8be4'::uuid);

-- ===== 20261030093710_revoke_catalog_items_delete_grant.sql =====
/*
# Revoke unused DELETE grant on catalog items

1. Modified table
- `pos_catalog_items`: the authenticated role no longer holds DELETE.

2. Security
- Catalog rows are never deleted; removals are stored as tombstones (deleted = true).
- No data is changed or removed by this migration.
*/

REVOKE DELETE ON public.pos_catalog_items FROM authenticated;

-- ===== 20261030133155_add_booking_reset_to_pos_sync.sql =====
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

  DELETE FROM public.pos_transactions WHERE id IS NOT NULL;
  DELETE FROM public.pos_cash_sessions WHERE id IS NOT NULL;
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

-- ===== 20261030135040_restrict_pos_booking_resets_grants.sql =====
/*
# Restrict grants on pos_booking_resets

1. Changes
- Removes all table privileges that Supabase grants by default to anon and authenticated on the new pos_booking_resets table.
- Re-grants only SELECT to authenticated (the admin account reads the reset marker).

2. Security
- TRUNCATE is not controlled by row level security, so the default grant would have let the anon key or any signed-in user clear the reset marker.
- Writes happen only inside reset_pos_bookings(), which runs as the table owner.
- No data is changed; existing rows stay as they are.
*/

REVOKE ALL ON public.pos_booking_resets FROM anon, authenticated;
GRANT SELECT ON public.pos_booking_resets TO authenticated;

-- ===== 20261101090000_harden_pos_booking_reset_generation.sql =====
/*
  Makes a reset an explicit generation boundary instead of relying on client
  clocks. Apply this migration before deploying the matching web build.
*/

ALTER TABLE public.pos_transactions
  ADD COLUMN IF NOT EXISTS booking_generation bigint NOT NULL DEFAULT 0;

ALTER TABLE public.pos_cash_sessions
  ADD COLUMN IF NOT EXISTS booking_generation bigint NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS pos_transactions_generation_timestamp_idx
  ON public.pos_transactions (booking_generation, timestamp);

CREATE INDEX IF NOT EXISTS pos_cash_sessions_generation_id_idx
  ON public.pos_cash_sessions (booking_generation, id);

CREATE OR REPLACE FUNCTION public.reset_pos_bookings_v2()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reset_at bigint := floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint;
  v_generation bigint;
BEGIN
  IF auth.uid() IS DISTINCT FROM '8461bbe1-9c6f-46c4-be41-dcbcc69f8be4'::uuid THEN
    RAISE EXCEPTION 'Nicht berechtigt.' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.pos_transactions WHERE id IS NOT NULL;
  DELETE FROM public.pos_cash_sessions WHERE id IS NOT NULL;
  INSERT INTO public.pos_booking_resets (reset_at)
  VALUES (v_reset_at)
  RETURNING id INTO v_generation;

  RETURN jsonb_build_object('reset_at', v_reset_at, 'generation', v_generation);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reset_pos_bookings_v2() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_pos_bookings_v2() TO authenticated;

CREATE OR REPLACE FUNCTION public.pos_skip_bookings_before_reset()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_generation bigint;
BEGIN
  SELECT COALESCE(max(id), 0) INTO current_generation FROM public.pos_booking_resets;
  IF NEW.booking_generation IS DISTINCT FROM current_generation THEN
    RAISE EXCEPTION 'Die Buchung stammt aus einer veralteten Kassen-Generation.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pos_transactions_skip_before_reset ON public.pos_transactions;
CREATE TRIGGER pos_transactions_skip_before_reset
  BEFORE INSERT ON public.pos_transactions
  FOR EACH ROW EXECUTE FUNCTION public.pos_skip_bookings_before_reset();

DROP TRIGGER IF EXISTS pos_cash_sessions_skip_before_reset ON public.pos_cash_sessions;
CREATE TRIGGER pos_cash_sessions_skip_before_reset
  BEFORE INSERT ON public.pos_cash_sessions
  FOR EACH ROW EXECUTE FUNCTION public.pos_skip_bookings_before_reset();

COMMIT;
