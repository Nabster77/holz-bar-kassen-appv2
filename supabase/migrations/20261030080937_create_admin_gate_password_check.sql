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
