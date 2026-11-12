import assert from 'node:assert/strict';
import { recoverableTransactions, recoverableCashSessions } from '../src/lib/recoveryGuards.ts';

const cloudTx = [{ id: 'paid', timestamp: 3000 }];
assert.deepEqual(recoverableTransactions(
  [{ id: 'paid', timestamp: 9000 }, { id: 'new', timestamp: 4500 }, { id: 'new', timestamp: 4500 },
   { id: 'old', timestamp: 1900 }, { id: 'invalid', timestamp: NaN }],
  cloudTx, 2000,
).map((t) => t.id), ['new'], 'never overwrite immutable sales, replay reset sales or duplicate IDs');

const news = (session) => Math.max(session.openedAt || 0, session.closedAt || 0, session.lastChange || 0);
const finalized = { id: 'closed', openedAt: 3000, closed: true, lastChange: 4000 };
const open = { id: 'open', openedAt: 3000, lastChange: 3500 };
const snapshot = { id: 'snapshot', openedAt: 3000, dailyCloseSnapshot: { finalizedAt: 5000 }, lastChange: 5000 };
const backups = [
  { ...finalized, lastChange: 9999 },
  { id: 'old', openedAt: 1000, lastChange: 9000 },
  { id: 'open', openedAt: 3000, lastChange: 3600 },
  { id: 'new', openedAt: 3000, lastChange: 3700 },
  { id: 'new', openedAt: 3000, lastChange: 3700 },
  { id: 'snapshot', openedAt: 3000, lastChange: 9000 },
];
assert.deepEqual(recoverableCashSessions(
  backups, [finalized, open, snapshot], 2000, news,
).map((x) => x.id), ['open', 'new'], 'do not alter finalized sessions; only newer open sessions and new current-generation sessions');
assert.deepEqual(recoverableCashSessions(
  [{ id: 'open', openedAt: 3000, lastChange: 3100 }], [open], 0, news,
), [], 'older sessions never overwrite newer cloud sessions');

console.log('Backup-Recovery-Grenztests bestanden: keine Storno-/Reset-Wiederbelebung, keine Ueberschreibung abgeschlossener Belege.');
