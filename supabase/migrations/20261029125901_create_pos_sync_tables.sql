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
