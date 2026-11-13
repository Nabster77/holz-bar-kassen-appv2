import assert from 'node:assert/strict';
import {
  prepareResetBackup, resetBackupCounts, digestResetBackup, verifyResetBackup,
  RESET_BACKUP_SECTIONS,
} from '../src/lib/bookingResetArchive.ts';

const records = {
  transactions: [
    { id: 'sale-2', location: 'Bregenz', data: { total: 7 } },
    { id: 'sale-1', location: 'Friedrichshafen', data: { total: 10 } },
  ],
  cashSessions: [
    { id: 'session-closed', data: { closed: true, dailyCloseSnapshot: { transactions: [{id:'sale-1'}] } } },
    { id: 'session-open', data: { closed: false, openingBalance: 75 } },
  ],
  stornos: [
    { id: 'cancel-1', original_transaction_id: 'sale-1', reason: 'Test-Storno' },
  ],
  dailyCloseReceipts: [
    { session_id: 'session-closed', receipt_number: 1, location: 'Friedrichshafen' },
  ],
  dailyCloseCounters: [
    { location: 'Friedrichshafen', calendar_year: 2026, last_sequence: 1 },
  ],
};
const before = JSON.stringify(records);
const date = new Date('2026-11-13T15:55:00Z');
const envelope = prepareResetBackup(records, date);
assert.equal(JSON.stringify(records), before, 'Backup must never change original records.');
assert.deepEqual(Object.keys(envelope.data), RESET_BACKUP_SECTIONS);
assert.equal(envelope.data.transactions.length, 2);
assert.equal(envelope.data.cashSessions.length, 2);
assert.equal(envelope.data.stornos.length, 1);
assert.equal(envelope.data.dailyCloseReceipts.length, 1);
assert.equal(envelope.data.dailyCloseCounters.length, 1);
const reordered = {...records, transactions: [...records.transactions].reverse()};
assert.deepEqual(prepareResetBackup(reordered, date), envelope, 'Row order must not change the backup.');
const serialized = JSON.stringify(envelope);
const sha256 = await digestResetBackup(serialized);
assert.match(sha256, /^[0-9a-f]{64}$/);
const checked = await verifyResetBackup(serialized, sha256, resetBackupCounts(records));
assert.deepEqual(checked, envelope, 'Verified readback must reproduce all booking records.');
await assert.rejects(verifyResetBackup(serialized+' ', sha256, resetBackupCounts(records)), /Prüfsumme/);
await assert.rejects(verifyResetBackup(serialized, sha256, {...resetBackupCounts(records), stornos: 0}), /stornos/);
assert.throws(()=>prepareResetBackup({transactions:[]} , date), /unvollständig/);
const empty = Object.fromEntries(RESET_BACKUP_SECTIONS.map(k => [k, []]));
assert.deepEqual(resetBackupCounts(prepareResetBackup(empty).data), Object.fromEntries(RESET_BACKUP_SECTIONS.map(k=>[k,0])));
console.log('V3-BUCHUNGSBACKUP: ALLE fünf Buchungsbereiche, Storno/Abschluss, Sortierung, SHA-256, Readback, Manipulationsschutz und Anzahlen OK.');
