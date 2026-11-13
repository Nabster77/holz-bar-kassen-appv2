import assert from 'node:assert/strict';
import { verifiedAdminResetEligibility } from '../src/lib/verifiedResetPolicy.ts';

const allGood = {
  administratorAuthenticated:true, online:true,
  backupPersistedAndReadBack:true, serverSnapshotStillMatchesBackup:true,
  pendingLocalBookings:false, connectedDevicesReconciled:true,
  explicitlyConfirmed:true, activeTillCount:0,
};
assert.deepEqual(verifiedAdminResetEligibility(allGood), {allowed:true});
assert.deepEqual(verifiedAdminResetEligibility({...allGood, activeTillCount:1}), {allowed:true},
  'An OPEN till must not block a completely verified V3 administrator reset.');
assert.deepEqual(verifiedAdminResetEligibility({...allGood, activeTillCount:2}), {allowed:true},
  'A verified total reset may close all open tills at both sites.');
for (const [field, failing] of [
  ['administratorAuthenticated', false],
  ['online', false],
  ['backupPersistedAndReadBack', false],
  ['serverSnapshotStillMatchesBackup', false],
  ['pendingLocalBookings', true],
  ['connectedDevicesReconciled', false],
  ['explicitlyConfirmed', false],
]) {
  const result = verifiedAdminResetEligibility({...allGood, [field]:failing});
  assert.equal(result.allowed, false, `Safety precondition ${field} must be enforced.`);
  assert.ok(result.reason);
}
console.log('V3-GESAMTRESET: im AKTIVEN Endmodus inklusive offener Kasse erlaubt NUR nach geprüftem Backup, Geräteabgleich und Admin-Bestätigung.');
