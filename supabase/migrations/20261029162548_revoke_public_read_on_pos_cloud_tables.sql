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
