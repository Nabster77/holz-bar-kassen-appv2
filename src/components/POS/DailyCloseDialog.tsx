import { useMemo, useState } from 'react';
import { X, Lock, FileDown, Check, TriangleAlert as AlertTriangle, Calculator } from 'lucide-react';
import { formatCurrency, formatDateLong, formatTime, formatWeekdayShort } from '@/lib/format';
import { escapeHtml } from '@/lib/escapeHtml';
import { mergeTaxByRate, getTaxByRate, sortedRateKeys } from '@/lib/tax';
import type { CashSession, Transaction } from '@/types';

const DENOMINATIONS: { label: string; value: number }[] = [
  { label: '1 Cent', value: 0.01 },
  { label: '2 Cent', value: 0.02 },
  { label: '5 Cent', value: 0.05 },
  { label: '10 Cent', value: 0.10 },
  { label: '20 Cent', value: 0.20 },
  { label: '50 Cent', value: 0.50 },
  { label: '1 Euro', value: 1 },
  { label: '2 Euro', value: 2 },
  { label: '5 Euro', value: 5 },
  { label: '10 Euro', value: 10 },
  { label: '20 Euro', value: 20 },
  { label: '50 Euro', value: 50 },
  { label: '100 Euro', value: 100 },
];

interface Props {
  session: CashSession;
  transactions: Transaction[];
  onClose: (closingBalance?: number) => void;
  onCancel: () => void;
}

export function DailyCloseDialog({ session, transactions, onClose, onCancel }: Props) {
  const [counts, setCounts] = useState<Record<number, string>>({});
  const [manualBalance, setManualBalance] = useState('');
  const [useCounting, setUseCounting] = useState(true);
  const [confirmed, setConfirmed] = useState(false);

  const sessionTx = useMemo(
    () => transactions.filter((t) => {
      const txDate = new Date(t.timestamp);
      const d = `${txDate.getFullYear()}-${String(txDate.getMonth() + 1).padStart(2, '0')}-${String(txDate.getDate()).padStart(2, '0')}`;
      return d === session.date && t.location === session.location;
    }),
    [transactions, session.date, session.location],
  );

  const txTotal = sessionTx.reduce((s, t) => s + t.total, 0);
  const taxByRate = useMemo(() => mergeTaxByRate(sessionTx), [sessionTx]);
  const totalTax = [...taxByRate.values()].reduce((s, v) => s + v, 0);
  const totalNet = sessionTx.reduce((s, t) => s + t.totalNet, 0);
  const deposits = session.entries.filter((e) => e.type === 'deposit').reduce((s, e) => s + e.amount, 0);
  const withdrawals = session.entries.filter((e) => e.type === 'withdrawal').reduce((s, e) => s + e.amount, 0);
  const expected = session.openingBalance + txTotal + deposits - withdrawals;

  const countedTotal = useMemo(() => {
    let sum = 0;
    for (const d of DENOMINATIONS) {
      const c = parseInt(counts[d.value] ?? '', 10);
      if (!isNaN(c) && c > 0) sum += c * d.value;
    }
    return Math.round(sum * 100) / 100;
  }, [counts]);

  const hasInput = useCounting ? Object.values(counts).some((v) => v && v !== '0') : !!manualBalance;
  const closingBalance = useCounting
    ? (hasInput ? countedTotal : expected)
    : (manualBalance ? parseFloat(manualBalance.replace(',', '.')) : expected);
  const diff = closingBalance - expected;

  function handleClose() {
    if (isNaN(closingBalance) || closingBalance < 0 || !confirmed) return;
    onClose(Math.round(closingBalance * 100) / 100);
  }

  function handlePDFExport() {
    const b = hasInput && !isNaN(closingBalance) ? closingBalance : expected;
    generatePDF({ ...session, closed: true, closedAt: Date.now() }, sessionTx, { txTotal, taxByRate: Object.fromEntries(taxByRate), totalNet, deposits, withdrawals, expected, closingBalance: b, difference: b - expected });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-contain bg-black/50 p-4 sm:items-center" onClick={onCancel}>
      <div className="my-auto flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col rounded-3xl bg-white shadow-2xl dark:bg-gray-800" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-gray-200 p-4 dark:border-gray-700">
          <h3 className="flex items-center gap-2 text-lg font-bold text-gray-900 dark:text-gray-100">
            <Lock className="h-5 w-5 text-blue-600 dark:text-blue-400" /> Tagesabschluss
          </h3>
          <button onClick={onCancel} className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="mb-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">{formatDateLong(session.openedAt)}</p>
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Standort: {session.location}</p>
          </div>

          {/* Summary */}
          <div className="mb-4 space-y-1.5 rounded-2xl bg-gray-50 p-4 dark:bg-gray-900/40">
            <Row label="Anfangsbestand" value={formatCurrency(session.openingBalance)} />
            <Row label="Verkaufsumsatz (inkl. MwSt.)" value={formatCurrency(txTotal)} bold />
            <Row label="Bareinlagen" value={`+ ${formatCurrency(deposits)}`} />
            <Row label="Barausgaben" value={`- ${formatCurrency(withdrawals)}`} />
            <div className="border-t border-gray-200 pt-1.5 dark:border-gray-700">
              <Row label="Erwarteter Kassenbestand" value={formatCurrency(expected)} bold />
            </div>
          </div>

          {/* Tax breakdown */}
          <div className="mb-4 space-y-1.5 rounded-2xl bg-gray-50 p-4 dark:bg-gray-900/40">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Mehrwertsteuer</p>
            <Row label="Nettoumsatz" value={formatCurrency(totalNet)} />
            {sortedRateKeys(taxByRate).map((rate) => (
              <Row key={rate} label={`MwSt ${rate}%`} value={formatCurrency(taxByRate.get(rate) ?? 0)} />
            ))}
            <Row label="MwSt gesamt" value={formatCurrency(totalTax)} bold />
          </div>

          {/* Transactions list */}
          {sessionTx.length > 0 && (
            <div className="mb-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Transaktionen ({sessionTx.length})</p>
              <div className="max-h-32 space-y-1 overflow-y-auto">
                {sessionTx.sort((a, b) => a.timestamp - b.timestamp).map((tx) => (
                  <div key={tx.id} className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                    <span>{formatTime(tx.timestamp)} · {tx.items.length} Artikel</span>
                    <span className="font-medium">{formatCurrency(tx.total)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Corrections */}
          {session.corrections.length > 0 && (
            <div className="mb-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Anfangsbestand-Korrekturen</p>
              <div className="space-y-1">
                {session.corrections.map((c) => (
                  <div key={c.id} className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                    <span>{formatTime(c.timestamp)}: {formatCurrency(c.oldAmount)} → {formatCurrency(c.newAmount)}</span>
                  </div>
                ))}
                {session.corrections.map((c) => (
                  <div key={`r-${c.id}`} className="text-xs text-gray-400">Grund: {c.reason}</div>
                ))}
              </div>
            </div>
          )}

          {/* Cash entries */}
          {session.entries.length > 0 && (
            <div className="mb-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Einlagen / Ausgaben</p>
              <div className="space-y-1">
                {session.entries.map((e) => (
                  <div key={e.id} className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                    <span>{formatTime(e.timestamp)} · {e.type === 'deposit' ? 'Einlage' : 'Ausgabe'}: {e.reason}</span>
                    <span className={e.type === 'deposit' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                      {e.type === 'deposit' ? '+' : '-'}{formatCurrency(e.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Closing balance: counting or manual */}
          <div className="mb-3">
            <div className="mb-2 flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Tatsächlicher Kassenbestand</label>
              <div className="flex gap-1 rounded-lg bg-gray-100 p-0.5 dark:bg-gray-900/60">
                <button onClick={() => setUseCounting(true)}
                  className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold transition ${useCounting ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}>
                  <Calculator className="h-3 w-3" /> Stückeln
                </button>
                <button onClick={() => setUseCounting(false)}
                  className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold transition ${!useCounting ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}>
                  Direkt
                </button>
              </div>
            </div>

            {useCounting ? (
              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900/40">
                <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {DENOMINATIONS.map((d) => (
                    <div key={d.value}>
                      <label className="mb-0.5 block text-xs text-gray-500 dark:text-gray-400">{d.label}</label>
                      <input
                        type="number"
                        min={0}
                        inputMode="numeric"
                        value={counts[d.value] ?? ''}
                        onChange={(e) => setCounts((prev) => ({ ...prev, [d.value]: e.target.value }))}
                        placeholder="0"
                        className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                      />
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex items-center justify-between border-t border-gray-200 pt-2 dark:border-gray-700">
                  <span className="text-xs text-gray-500 dark:text-gray-400">Leere Felder zählen als 0. Summe aus Stückelung:</span>
                  <span className="text-base font-bold text-gray-900 dark:text-gray-100">{formatCurrency(countedTotal)}</span>
                </div>
              </div>
            ) : (
              <input
                value={manualBalance}
                onChange={(e) => setManualBalance(e.target.value)}
                placeholder={formatCurrency(expected)}
                inputMode="decimal"
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
              />
            )}
          </div>

          {hasInput && !isNaN(closingBalance) && Math.abs(diff) > 0.01 && (
            <div className={`mb-3 flex items-center gap-2 rounded-xl p-3 text-sm ${diff > 0 ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
              <AlertTriangle className="h-4 w-4" />
              {diff > 0 ? `Mehrbestand: ${formatCurrency(diff)}` : `Fehlbestand: ${formatCurrency(Math.abs(diff))}`}
            </div>
          )}

          {hasInput && !isNaN(closingBalance) && Math.abs(diff) <= 0.01 && (
            <div className="mb-3 flex items-center gap-2 rounded-xl bg-blue-50 p-3 text-sm text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
              <Check className="h-4 w-4" />
              Kassenbestand stimmt mit dem errechneten Bestand überein.
            </div>
          )}

          <div className="mb-3 rounded-xl bg-green-50 p-3 dark:bg-green-900/30">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-green-600 dark:text-green-500">Tagesumsatz</p>
            <div className="space-y-1">
              <div className="flex items-center justify-between text-sm text-green-700 dark:text-green-400">
                <span>Brutto-Umsatz (inkl. MwSt.)</span>
                <span className="text-lg font-bold text-green-700 dark:text-green-400">{formatCurrency(txTotal)}</span>
              </div>
              <div className="flex items-center justify-between text-sm text-green-700/80 dark:text-green-500">
                <span>Netto-Umsatz</span>
                <span className="font-medium">{formatCurrency(totalNet)}</span>
              </div>
              <div className="flex items-center justify-between text-sm text-green-700/80 dark:text-green-500">
                <span>Enthaltene Mehrwertsteuer</span>
                <span className="font-medium">{formatCurrency(totalTax)}</span>
              </div>
            </div>
          </div>

          {!hasInput && (
            <div className="mb-3 rounded-xl bg-gray-50 p-3 text-sm text-gray-500 dark:bg-gray-900/40 dark:text-gray-400">
              Keine Stückelung eingegeben. Beim Abschließen wird der errechnete Bestand ({formatCurrency(expected)}) als Ist-Bestand übernommen.
            </div>
          )}

          <label className="mb-3 flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="h-4 w-4 rounded accent-blue-600" />
            Ich bestätige, dass der Tagesabschluss korrekt ist. Nach dem Abschließen ist er nicht mehr änderbar.
          </label>
        </div>

        <div className="flex gap-2 border-t border-gray-200 p-4 dark:border-gray-700">
          <button onClick={handlePDFExport}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-gray-300 bg-white py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700">
            <FileDown className="h-4 w-4" /> PDF-Export
          </button>
          <button onClick={handleClose} disabled={isNaN(closingBalance) || closingBalance < 0 || !confirmed}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-blue-700 active:scale-95 disabled:opacity-50">
            <Check className="h-4 w-4" /> Endgültig abschließen
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between text-sm">
      <span className={bold ? 'font-bold text-gray-900 dark:text-gray-100' : 'text-gray-600 dark:text-gray-400'}>{label}</span>
      <span className={bold ? 'font-bold text-gray-900 dark:text-gray-100' : 'text-gray-600 dark:text-gray-400'}>{value}</span>
    </div>
  );
}

// ---- PDF generation ----

function generatePDF(
  session: CashSession,
  txList: Transaction[],
  sums: { txTotal: number; taxByRate: Record<number, number>; totalNet: number; deposits: number; withdrawals: number; expected: number; closingBalance: number; difference: number },
) {
  const taxEntries = Object.entries(sums.taxByRate)
    .map(([r, v]) => [Number(r), v] as const)
    .sort((a, b) => a[0] - b[0]);
  const totalTax = taxEntries.reduce((s, [, v]) => s + v, 0);

  const rows = txList
    .sort((a, b) => a.timestamp - b.timestamp)
    .map((tx, i) => {
      const txTax = [...getTaxByRate(tx).values()].reduce((s, v) => s + v, 0);
      return `<tr><td>${i + 1}</td><td>${formatTime(tx.timestamp)}</td><td>${tx.items.length}</td><td>${formatCurrency(tx.total)}</td><td>${formatCurrency(txTax)}</td></tr>`;
    })
    .join('');

  const corrections = session.corrections
    .map((c) => `<tr><td>${formatTime(c.timestamp)}</td><td>${formatCurrency(c.oldAmount)}</td><td>${formatCurrency(c.newAmount)}</td><td>${escapeHtml(c.reason)}</td></tr>`)
    .join('');

  const entries = session.entries
    .map((e) => `<tr><td>${formatTime(e.timestamp)}</td><td>${e.type === 'deposit' ? 'Einlage' : 'Ausgabe'}</td><td>${formatCurrency(e.amount)}</td><td>${escapeHtml(e.reason)}</td></tr>`)
    .join('');

  const auditRows = [
    ...session.entries.map((entry) => ({
      timestamp: entry.timestamp,
      kind: entry.type === 'deposit' ? 'Einlage' : 'Ausgabe',
      value: `${entry.type === 'deposit' ? '+' : '-'}${formatCurrency(entry.amount)}`,
      reason: entry.reason,
    })),
    ...session.corrections.map((correction) => ({
      timestamp: correction.timestamp,
      kind: 'Korrektur',
      value: `${formatCurrency(correction.oldAmount)} → ${formatCurrency(correction.newAmount)}`,
      reason: correction.reason,
    })),
  ].sort((a, b) => a.timestamp - b.timestamp)
    .map((row) => `<tr><td>${formatWeekdayShort(row.timestamp)}, ${new Date(row.timestamp).toLocaleDateString('de-DE')} ${formatTime(row.timestamp)}</td><td>${row.kind}</td><td>${escapeHtml(row.value)}</td><td>${escapeHtml(row.reason)}</td></tr>`)
    .join('');

  const taxLines = taxEntries.map(([rate, amt]) => `<div class="sum"><span>davon MwSt ${rate}%</span><span>${formatCurrency(amt)}</span></div>`).join('');

  const html = `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8">
  <title>Tagesabschluss_${escapeHtml(session.location)}_${escapeHtml(session.date)}</title>
  <style>
    @page { size: A4; margin: 25mm 14mm 20mm; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Helvetica', sans-serif; padding: 40px; color: #1a1a1a; line-height: 1.5; }
    h1 { font-size: 22px; margin-bottom: 4px; }
    h2 { font-size: 16px; margin-top: 24px; margin-bottom: 8px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
    .info { margin-bottom: 16px; font-size: 13px; color: #555; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 16px; }
    th { text-align: left; padding: 6px 8px; border-bottom: 2px solid #333; }
    td { padding: 4px 8px; border-bottom: 1px solid #eee; }
    tr:nth-child(even) { background: #fafafa; }
    .sum { display: flex; justify-content: space-between; font-size: 13px; padding: 4px 0; }
    .sum.bold { font-weight: bold; border-top: 1px solid #333; margin-top: 8px; padding-top: 8px; }
    .highlight { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; margin-bottom: 16px; }
    .sales-box { background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 10px; padding: 16px; margin-bottom: 16px; }
    .sales-box h2 { margin-top: 0; border-bottom: 1px solid #a7f3d0; color: #047857; }
    .sales-box .sum { font-size: 14px; padding: 6px 0; }
    .sales-box .sum.headline { font-size: 18px; font-weight: bold; color: #047857; padding: 8px 0; border-bottom: 1px solid #a7f3d0; margin-bottom: 4px; }
    .sales-box .sum.bold { border-top: 1px solid #a7f3d0; color: #047857; }
    .print-running-header, .print-running-footer { display: none; }
    @media print {
      * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      body { padding: 0; }
      .print-running-header { display: flex; position: fixed; top: 6mm; left: 0; right: 0; justify-content: space-between; border-bottom: 1px solid #94a3b8; padding-bottom: 3mm; color: #1e3a5f; font-size: 9pt; }
      .print-running-footer { display: flex; position: fixed; bottom: 6mm; left: 0; right: 0; justify-content: space-between; border-top: 1px solid #cbd5e1; padding-top: 3mm; color: #64748b; font-size: 8pt; }
      .print-running-footer .page-count::after { content: 'Seite ' counter(page) ' von ' counter(pages); }
      h2 { break-after: avoid; page-break-after: avoid; }
      thead { display: table-header-group; }
      tr, td, th, .highlight, .sales-box { break-inside: avoid; page-break-inside: avoid; }
    }
  </style></head><body>
  <div class="print-running-header"><strong>Tagesabschluss</strong><span>${escapeHtml(session.location)} · ${escapeHtml(session.date)}</span></div>
  <div class="print-running-footer"><span>Kassenabschluss automatisch generiert</span><span class="page-count"></span></div>
  <h1>Tagesabschluss</h1>
  <div class="info">
    Datum: ${formatWeekdayShort(session.openedAt)}, ${escapeHtml(session.date)} | Standort: ${escapeHtml(session.location)} | Eröffnet: ${formatTime(session.openedAt)}<br>
    Geschlossen: ${session.closedAt ? formatTime(session.closedAt) : 'Entwurf'}
  </div>
  <div class="sales-box">
    <h2>Tagesumsatz</h2>
    <div class="sum headline"><span>Brutto-Umsatz (inkl. MwSt.)</span><span>${formatCurrency(sums.txTotal)}</span></div>
    <div class="sum"><span>Netto-Umsatz</span><span>${formatCurrency(sums.totalNet)}</span></div>
    <div class="sum bold"><span>Enthaltene Mehrwertsteuer gesamt</span><span>${formatCurrency(totalTax)}</span></div>
    ${taxLines}
  </div>
  <h2>Kassenbestand</h2>
  <div class="highlight">
    <div class="sum"><span>Anfangsbestand</span><span>${formatCurrency(session.openingBalance)}</span></div>
    <div class="sum"><span>Verkaufsumsatz (inkl. MwSt.)</span><span>${formatCurrency(sums.txTotal)}</span></div>
    <div class="sum"><span>Bareinlagen</span><span>+ ${formatCurrency(sums.deposits)}</span></div>
    <div class="sum"><span>Barausgaben</span><span>- ${formatCurrency(sums.withdrawals)}</span></div>
    <div class="sum bold"><span>Erwarteter Kassenbestand</span><span>${formatCurrency(sums.expected)}</span></div>
    <div class="sum bold"><span>Tatsächlicher Kassenbestand</span><span>${formatCurrency(sums.closingBalance)}</span></div>
    <div class="sum bold"><span>Differenz</span><span>${formatCurrency(sums.difference)}</span></div>
  </div>
  <h2>Transaktionen (${txList.length})</h2>
  <table><thead><tr><th>#</th><th>Uhrzeit</th><th>Artikel</th><th>Betrag</th><th>MwSt</th></tr></thead><tbody>${rows}</tbody></table>
  ${auditRows ? `<h2>Kassenbewegungen und Korrekturen</h2><table><thead><tr><th>Datum/Zeit</th><th>Vorgang</th><th>Betrag / Änderung</th><th>Grund</th></tr></thead><tbody>${auditRows}</tbody></table>` : ''}
  ${corrections ? `<h2>Anfangsbestand-Korrekturen</h2><table><thead><tr><th>Uhrzeit</th><th>Alt</th><th>Neu</th><th>Grund</th></tr></thead><tbody>${corrections}</tbody></table>` : ''}
  ${entries ? `<h2>Einlagen / Ausgaben</h2><table><thead><tr><th>Uhrzeit</th><th>Typ</th><th>Betrag</th><th>Grund</th></tr></thead><tbody>${entries}</tbody></table>` : ''}
  </body></html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const printWin = window.open(url, '_blank', 'width=900,height=700');
  if (!printWin) {
    alert('Bitte Popups für diese Seite erlauben, um den PDF-Export zu nutzen.');
    URL.revokeObjectURL(url);
    return;
  }
  const triggerPrint = () => {
    try { printWin.focus(); printWin.print(); } catch { /* ignore */ }
  };
  printWin.onload = triggerPrint;
  setTimeout(triggerPrint, 600);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
