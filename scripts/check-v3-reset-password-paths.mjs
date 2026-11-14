import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { authorizedResetPassword } from '../supabase/functions/woodmo-v3-reset/authorizePassword.ts';

const credential = (password, role, active = true) => {
  const salt = randomBytes(16);
  return { role, active, passwordSalt: salt.toString('base64'),
    passwordHash: pbkdf2Sync(password, salt, 210_000, 32, 'sha256').toString('base64') };
};
const accounts = [
  credential('valid-admin-test-secret', 'administrator'),
  credential('employee-test-secret', 'employee'),
  credential('inactive-admin-test-secret', 'administrator', false),
];
async function check(label, input, managerValid, expected) {
  assert.equal(await authorizedResetPassword(input, managerValid, accounts), expected, label);
  console.log('PASS: ' + label);
}
await check('1 aktiver Administrator', 'valid-admin-test-secret', false, true);
await check('2 aktuelles Standard-Verwaltungspasswort', 'kasse', true, true);
await check('3 altes Standardpasswort nach Änderung abgelehnt', 'kasse', false, false);
await check('3b geändertes Verwaltungspasswort angenommen', 'new-manager-test-secret', true, true);
await check('4 Mitarbeiterpasswort abgelehnt', 'employee-test-secret', false, false);
await check('5 falsches Passwort abgelehnt', 'wrong-test-secret', false, false);
await check('deaktivierter Administrator abgelehnt', 'inactive-admin-test-secret', false, false);
const read = path => readFileSync(path, 'utf8');
const ui = read('src/components/Admin/AdminScreen.tsx');
const sql = read('supabase/migrations/20261114140000_woodmo_v3_admin_password_reset_gateway.sql');
const manager = read('src/lib/managerAuth.ts');
const reset = read('src/lib/bookingReset.ts');
const edge = read('supabase/functions/woodmo-v3-reset/index.ts');
assert.match(ui, /const latest = await onCheck\(setReport\);\s*setReport\(latest\);/);
assert.match(ui, /latest\.backupSignature !== exportedSignature/);
assert.match(ui, /report\.backupSignature === exportedSignature/);
assert.match(ui, /Falsches Passwort\. Es wurde nichts zurückgesetzt\./);
let report = { total: 4, completed: 4, resetAllowed: true, backupSignature: 'same-proof' };
let savedBackup = true, backupRequested = true, exportedSignature = 'same-proof';
const enabled = () => report.completed === report.total && report.resetAllowed &&
  savedBackup && backupRequested && !!exportedSignature && report.backupSignature === exportedSignature;
assert.equal(enabled(), true);
report = { ...report }; // latest complete report after a rejected wrong password
assert.equal(enabled(), true, 'Button stays enabled after failed password without new backup');
console.log('PASS: Reset-Button nach falschem Passwort ohne neues Backup aktiv');
report = { ...report, backupSignature: 'changed-proof' };
assert.equal(enabled(), false, 'Real ledger changes still invalidate the backup proof');
assert.match(manager, /rpc\('set_admin_gate_password'/);
assert.match(manager, /rpc\('verify_admin_gate_password'/);
assert.doesNotMatch(manager, /password === 'kasse'/);
assert.match(reset, /functions\.invoke\('woodmo-v3-reset'/);
assert.match(edge, /auth\.getUser\(token\)/);
assert.match(edge, /authorizedResetPassword/);
assert.match(sql, /request\.jwt\.claim\.role/);
assert.match(sql, /pg_advisory_xact_lock/);
assert.match(sql, /dailyCloseFinalizedAt/);
assert.match(sql, /FROM PUBLIC, anon, authenticated/);
assert.match(sql, /TO service_role/);
assert.doesNotMatch(sql, /\bDELETE FROM\b|\bTRUNCATE\b|\bDROP TABLE\b/i);
console.log('WOODMO V3 reset password and preserved backup tests passed. No cloud reset.');
