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
