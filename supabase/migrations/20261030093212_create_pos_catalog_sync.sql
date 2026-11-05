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
