const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'src/App.tsx'), 'utf8');
const recovery = fs.readFileSync(path.join(root, 'src/lib/backupRecovery.ts'), 'utf8');

const start = app.indexOf('  async function resetBookings() {');
const end = app.indexOf('  function navigateTo(', start);
assert.ok(start >= 0 && end > start, 'Buchungs-Reset muss vorhanden sein');
const body = app.slice(start, end);
assert.match(body, /resetCloudBookings\(\)/, 'Cloud-Reset bleibt erhalten');
assert.match(body, /discardEntriesBeforeGeneration\(/, 'Offline-Altbuchungen bleiben gesperrt');
assert.match(body, /store\.resetAllData\(\)/, 'Lokale Buchungen werden neutralisiert');
for (const disallowed of [
  'auth.updateUser', 'auth.signOut', 'resetManagerPassword',
  'rootPasswordChanged', 'rootPasswordNoticeDismissed', 'setLastStaffId',
]) {
  assert.ok(!body.includes(disallowed), 'Buchungs-Reset darf keine Anmeldung oder Passwortangabe veraendern: ' + disallowed);
}
assert.ok(!recovery.includes('await clearOutbox();'), 'Backup-Import darf nicht ungesendete Buchungen verwerfen');
assert.match(recovery, /await discardEntriesBeforeGeneration\(/);
assert.match(recovery, /while \(await flushOutbox\(\)\)/);
assert.match(recovery, /canReplayBookings = backupTime > resetAt/);
console.log('Sicherheitspruefung bestanden: Buchungs-Reset veraendert keine Anmeldedaten und Backup vernachlaessigt keine vorgemerkten Buchungen.');
