import assert from 'node:assert/strict';
import { activeCashSessionsByLocation, canOpenNewCashSession } from '../src/lib/activeCashSessions.ts';

const beforeMidnight = Date.parse('2026-11-12T22:55:00Z');
const later = Date.parse('2026-11-13T08:00:00Z');
const opening = {
  id: 'open-from-yesterday', location: 'Friedrichshafen',
  date: '2026-11-12', openedAt: beforeMidnight, closed: false,
  openingBalance: 100, entries: [], corrections: [],
};
const otherSite = { ...opening, id: 'bregenz', location: 'Bregenz' };

assert.deepEqual(activeCashSessionsByLocation([opening]).map(x => x.id), [opening.id],
  'Open till must survive the date boundary.');
assert.equal(canOpenNewCashSession([opening], 'Friedrichshafen'), false,
  'Second opening must be blocked even on another day.');
assert.equal(canOpenNewCashSession([opening], 'Bregenz'), true,
  'The other location can still open its own till.');
assert.equal(activeCashSessionsByLocation([otherSite, opening]).length, 2,
  'Independent sites can have one active till each.');
const finalized = { ...opening, closed: true, closedAt: later,
  dailyCloseFinalizedAt: later, dailyCloseSnapshot: { finalizedAt: later } };
assert.equal(activeCashSessionsByLocation([finalized]).length, 0,
  'Finalized session cannot be resumed.');
assert.equal(canOpenNewCashSession([finalized], 'Friedrichshafen'), true,
  'New session is possible after final close.');
const newerFinalized = { ...finalized, id: 'newer-close', openedAt: later + 1000 };
assert.equal(activeCashSessionsByLocation([opening, newerFinalized]).length, 0,
  'An older stale open record must not supersede a newer closed session.');
const discarded = { ...opening, discarded: true };
assert.equal(activeCashSessionsByLocation([discarded]).length, 0);
assert.equal(canOpenNewCashSession([discarded], 'Friedrichshafen'), true);
const flaggedSnapshot = { ...opening, dailyCloseSnapshot: { finalizedAt: later } };
assert.equal(activeCashSessionsByLocation([flaggedSnapshot]).length, 0,
  'A snapshot marks a finalized till even if closed flag is inconsistent.');
assert.deepEqual(activeCashSessionsByLocation([opening, opening]).map(x=>x.id), [opening.id],
  'Duplicate local copies of the same session must not create multiple active tills.');
console.log('MIDNIGHT-SESSIONS: open/resume, per-site isolation, final close and duplicate opening checks passed.');
