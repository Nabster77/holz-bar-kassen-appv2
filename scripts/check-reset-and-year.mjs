import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { businessCloseDate, businessCloseYear, formatDailyCloseNumber }
  from '../src/lib/dailyCloseNumbering.ts';

// Jahreswechsel: 31.12.2026 23:30 UTC = 01.01.2027 00:30 (DE/AT).
const before = Date.parse('2026-12-31T22:30:00Z');
const after = Date.parse('2026-12-31T23:30:00Z');
assert.equal(businessCloseDate(before), '2026-12-31');
assert.equal(businessCloseDate(after), '2027-01-01');
assert.equal(businessCloseYear(after), 2027);
assert.equal(formatDailyCloseNumber(1, 'Friedrichshafen', after), 'TA-FN-2027-000001');
assert.equal(formatDailyCloseNumber(1, 'Bregenz', after), 'TA-BR-2027-000001');
assert.equal(formatDailyCloseNumber(25, 'Friedrichshafen', before), 'TA-FN-2026-000025');
assert.equal(formatDailyCloseNumber(1, 'Bregenz', after, 2026), 'TA-BR-2026-000001',
  'Historische Belege behalten ihr gespeichertes Ausgabejahr.');
assert.equal(businessCloseDate(Date.parse('2027-07-01T22:30:00Z')),
  '2027-07-02', 'Sommerzeit korrekt.');

const sql = readFileSync('supabase/migrations/20261109100000_reset_daily_close_receipt_counters.sql', 'utf8');
const app = readFileSync('src/App.tsx', 'utf8');
const receipt = readFileSync('src/lib/dailyCloseReceipt.ts', 'utf8');
const resetBody = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.reset_pos_bookings_v2'));
assert.ok(resetBody, 'Cloud-Reset muss vorhanden sein');
for (const table of ['pos_daily_close_receipts', 'pos_daily_close_receipt_counters',
  'pos_transactions', 'pos_cash_sessions']) {
  assert.match(resetBody, new RegExp('DELETE\\s+FROM\\s+public\\.'+table+'\\b','i'),
    'Cloud-Reset muss auch '+table+' entfernen');
}
assert.match(resetBody, /INSERT INTO public\.pos_booking_resets/,
  'Neue Generation verhindert Wiederherstellen alter Offline-Buchungen.');
assert.match(app, /await resetCloudBookings\(\)/);
assert.match(app, /store\.resetAllData\(\)/);
assert.match(receipt, /p_close_date:\s*localDate/,
  'Tagesabschlussnummer muss anhand des lokalen Datums vergeben werden.');
assert.doesNotMatch(receipt, /toISOString\(\)\.slice\(0,\s*10\)/,
  'Der UTC-Tageswechsel darf nicht für Buchungsnummern benutzt werden.');
console.log('RESET/JAHRESWECHSEL: DB-Resetumfang, Zähler 000001, lokale Jahreszahl 2027 und Sperre alter Buchungen bestanden.');
