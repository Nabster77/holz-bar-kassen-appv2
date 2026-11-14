const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
const cache = {};
function load(name) {
  if (cache[name]) return cache[name];
  if (name === 'journalPdfFile') return { buildJournalFileName: () => 'test.pdf' };
  if (name === 'dailyCloseReceipt') return { formatDailyCloseReceiptNumber: () => 'TA-FN-2026-000001' };
  const exports = cache[name] = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/lib', name + '.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  new Function('require', 'exports', code)((id) => load(id.replace('@/lib/', '')), exports);
  return exports;
}
const { closedSessionReport } = load('dailyReport');
const { buildJournalHTML } = load('journalPdf');
const { formatCashSessionTimestamp } = load('cashSessionTimes');
const { movementStyle, hasNegativeMoney } = load('movementStyle');
const movementKinds = ['Pfandausgabe', 'Bareinnahme', 'Karteneinnahme', 'Einlage', 'Ausgabe', 'Korrektur'];
assert.equal(new Set(movementKinds.map(kind => movementStyle(kind).ink)).size, 6);
assert.equal(movementStyle('Pfand-Retoure').ink, movementStyle('Pfandausgabe').ink);
assert.equal(movementStyle('Entnahme zum Tagesabschluss').ink, movementStyle('Ausgabe').ink);
assert.ok(hasNegativeMoney('100,00 € → 90,00 € (-10,00 €)'));
assert.ok(!hasNegativeMoney('-0,00 €'));
assert.ok(!hasNegativeMoney('Pfand-Retoure am 10.11.2026'));
const stamp = new Date('2026-11-09T12:00:00').getTime();
const base = { id: 'session', date: '2026-11-09', location: 'Friedrichshafen', openedAt: stamp,
  closedAt: stamp + 60000, closed: true, openingBalance: 190, entries: [], corrections: [], staffLoginIntervals: [] };
const item = { name: 'Ware', productId: 'p', categoryId: 'c', quantity: 1, price: 10.7,
  netPrice: 10, taxAmount: 0.7, taxRate: 7, pfand: 3 };
const cash = { id: 'cash', timestamp: stamp + 1000, location: base.location, paymentMethod: 'cash',
  subtotal: 10.7, total: 13.7, totalNet: 10, totalTax: 0.7, totalPfand: 3, taxByRate: { 7: 0.7 }, items: [item] };
const card = { ...cash, id: 'card', paymentMethod: 'card' };
const ret = { ...cash, id: 'return', subtotal: 0, total: -6, totalNet: 0, totalTax: 0,
  totalPfand: -6, taxByRate: {}, items: [{ ...item, price: -3, quantity: 2, pfand: -6, taxRate: 0, taxAmount: 0, isPfandRetoure: true }] };
const session = { ...base, corrections: [{ id: 'correction', oldAmount: 200, newAmount: 190, timestamp: stamp, reason: 'Zaehlung' }],
  entries: [{ id: 'in', type: 'deposit', amount: 50, timestamp: stamp + 2000, reason: 'Wechselgeld' },
    { id: 'out', type: 'withdrawal', amount: 5, timestamp: stamp + 3000, reason: 'Ausgabe' }] };
const rows = [cash, card, ret, { ...cash, id: 'old', timestamp: stamp - 1000 }];
const report = closedSessionReport(session, rows, []);
// Archived close figures must be frozen at the close time, not at the current
// year-to-date totals. A later transaction must not alter the old PDF values.
const laterSale = { ...cash, id: 'after-close', timestamp: session.closedAt + 5000,
  items: [{ ...item, pfand: 90 }] };
const reportAfterLaterSale = closedSessionReport(session, [...rows, laterSale], []);
assert.deepEqual(reportAfterLaterSale.transactions, report.transactions);
assert.deepEqual(reportAfterLaterSale.yearlyPfandOverview, report.yearlyPfandOverview,
  'Later deposits must not change a finalized historical PDF');
assert.equal(reportAfterLaterSale.dailyCloseCash.remainingBalance, report.dailyCloseCash.remainingBalance);
assert.ok(buildJournalHTML(report).includes('data-pdf-page-header="Tagesabschluss · Friedrichshafen · 9.11.2026 · 12:01 Uhr"'));
assert.ok(buildJournalHTML(report).includes('data-pdf-page-location="Friedrichshafen"'));
assert.equal(report.cashSessionPeriod.openedAt, session.openedAt);
assert.equal(report.cashSessionPeriod.closedAt, session.closedAt);
assert.ok(buildJournalHTML(report).includes('Kasseneröffnung: ' + formatCashSessionTimestamp(session.openedAt)));
assert.ok(buildJournalHTML(report).includes('Endgültiger Tagesabschluss: ' + formatCashSessionTimestamp(session.closedAt)));
assert.throws(() => closedSessionReport({ ...session, closedAt: undefined }, rows, []),
  /Abschlusszeitpunkt/, 'A finalized PDF must never invent a missing close timestamp');
const acrossMidnight = closedSessionReport({
  ...session,
  openedAt: Date.parse('2026-11-14T22:45:00Z'),
  closedAt: Date.parse('2026-11-16T00:15:00Z'),
}, [], []);
const overnightPdf = buildJournalHTML(acrossMidnight);
assert.equal(formatCashSessionTimestamp(acrossMidnight.cashSessionPeriod.openedAt), '14.11.2026, 23:45:00 Uhr');
assert.equal(formatCashSessionTimestamp(acrossMidnight.cashSessionPeriod.closedAt), '16.11.2026, 01:15:00 Uhr');
assert(overnightPdf.includes('Kasseneröffnung: 14.11.2026, 23:45:00 Uhr'));
assert(overnightPdf.includes('Endgültiger Tagesabschluss: 16.11.2026, 01:15:00 Uhr'));

assert.ok(buildJournalHTML(report).includes('class="audit-totals"'));
assert.ok(buildJournalHTML(report).includes('class="audit-note"'));
assert.equal(report.transactions.length, 3);
assert.equal(report.dailyCloseCash.remainingBalance, 242.7); // 190 + 13.70 - 6 + 50 - 5
assert.equal(report.dailyCloseCash.openingCorrectionTotal, -10); // already in the 190
assert.equal(report.dailyCloseCash.cashPfandIncome, 3);
assert.equal(report.dailyCloseCash.cashPfandPayout, 6);
const closed = closedSessionReport({ ...session, closingWithdrawalAmount: 242.7,
  entries: [...session.entries, { id: 'final', type: 'withdrawal', amount: 242.7, isClosingWithdrawal: true, timestamp: stamp + 4000, reason: 'Abschluss' }] }, rows, []);
assert.equal(closed.dailyCloseCash.remainingBalance, 0);
assert.equal(closed.dailyCloseCash.balanceBeforeWithdrawal, 242.7);
for (const label of ['Tagesjournal', 'Wochenjournal', 'Monatsjournal', 'Jahresjournal', 'Zeitraum']) {
  const html = buildJournalHTML({ ...report, documentTitle: 'Kassenjournal', headerLabel: label });
  assert.ok(!html.includes('data-pdf-page-header='), 'Continuation labels are limited to daily-close reports');
  assert.ok(html.includes('Wechselgeld') && html.includes('Zaehlung') && html.includes('Ausgabe'), label);
  assert.ok(!html.includes('NaN'), label);
}
const combined = buildJournalHTML({ ...report, location: 'Alle Standorte' });
assert.ok(combined.includes('Friedrichshafen') && combined.includes('Bregenz'));
assert.ok(!combined.includes('NaN'));
console.log('Berichtspruefungen erfolgreich: Bar/Karte/Pfand, Einlage/Ausgabe/Korrektur, Vollentnahme, fuenf Journalarten und beide Standorte.');
