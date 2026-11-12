import assert from 'node:assert/strict';
import { businessCloseDate, businessCloseYear, formatDailyCloseNumber } from '../src/lib/dailyCloseNumbering.ts';

// 2026-12-31 23:30 UTC is 2027-01-01 00:30 in Friedrichshafen/Bregenz.
const first2027 = Date.parse('2026-12-31T23:30:00Z');
const last2026 = Date.parse('2026-12-31T22:30:00Z');
assert.equal(businessCloseDate(last2026), '2026-12-31');
assert.equal(businessCloseDate(first2027), '2027-01-01');
assert.equal(businessCloseYear(first2027), 2027);
assert.equal(formatDailyCloseNumber(1,'Friedrichshafen',first2027),
  'TA-FN-2027-000001');
assert.equal(formatDailyCloseNumber(1,'Bregenz',first2027),
  'TA-BR-2027-000001');
assert.equal(formatDailyCloseNumber(42,'Friedrichshafen',last2026),
  'TA-FN-2026-000042');
assert.equal(formatDailyCloseNumber(1,'Friedrichshafen',first2027,2027),
  'TA-FN-2027-000001');
// Old archived receipt keeps its issued year even if viewed in a later year.
assert.equal(formatDailyCloseNumber(18,'Bregenz',first2027,2026),
  'TA-BR-2026-000018');
assert.equal(businessCloseDate(Date.parse('2027-06-10T22:45:00Z')),
  '2027-06-11', 'Sommerzeit berücksichtigen');
assert.throws(()=>businessCloseDate(NaN),/Ungültiger/);
console.log('BELEGNUMMERN: Silvester 2026, Neujahr 2027, DE/AT und Sommerzeit bestanden.');
