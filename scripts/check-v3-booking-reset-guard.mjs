import assert from 'node:assert/strict';
import { assertBookingResetSafe } from '../src/lib/bookingResetSafety.ts';

const open = {
  id: 'open', location: 'Friedrichshafen', date: '2026-11-12',
  openedAt: Date.parse('2026-11-12T21:30:00Z'), openingBalance: 100,
  entries: [], corrections: [], closed: false,
};
const closed = {
  ...open, id: 'closed', closed: true,
  closedAt: Date.parse('2026-11-13T02:30:00Z'),
  dailyCloseFinalizedAt: Date.parse('2026-11-13T02:30:00Z'),
  dailyCloseReceiptNumber: 15,
};
const anotherLocation = { ...open, location: 'Bregenz', id: 'bregenz-open' };

for (const mode of [true, false]) {
  for (const sessions of [[open], [anotherLocation], [closed, open]]) {
    assert.throws(() => assertBookingResetSafe(sessions, mode), /aktiven Kasse|aktive Kasse/i,
      'No reset may erase any open till, including across midnight or at another location.');
  }
}
assert.doesNotThrow(() => assertBookingResetSafe([], true),
  'A simulated test ledger may be cleared if no till is active.');
assert.doesNotThrow(() => assertBookingResetSafe([closed], true),
  'Test mode is a temporary simulation; without an open till, it may be cleared.');
assert.throws(() => assertBookingResetSafe([], false), /Aktivmodus.*gesperrt/,
  'A new browser with no sessions must not erase other devices via legacy cloud reset.');
assert.throws(() => assertBookingResetSafe([closed], false), /Aktivmodus.*gesperrt/,
  'A finalized session must never be erased by the legacy reset.');
console.log('V3-RESET-SCHUTZ: aktiver Standort, Mitternacht, altes Cloud-RPC und Testmodus geprüft.');
