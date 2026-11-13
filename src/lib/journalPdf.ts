import { movementBadgeHTML } from '@/lib/movementStyle';
import type { Category, Transaction, Location } from '@/types';
import type { StornoRecord } from '@/lib/stornoRules';
import type { StornoJournalTransaction } from '@/lib/stornoReportProjection';
import { formatCurrency, formatDate, formatTime } from '@/lib/format';
import { isTaxFreeItem, getTaxByRate } from '@/lib/tax';
import { escapeHtml } from '@/lib/escapeHtml';

export interface JournalReportData {
  headerLabel: string;
  location: string;
  transactions: Transaction[];
  /** Full auditable reversal evidence, separate from report-only negative projections. */
  stornos?: StornoRecord[];
  categories: Category[];
  fileName: string;
  /** Date the report covers, independently of the date it is exported. */
  reportPeriodStart?: number;
  /** Person, die den Export bzw. Druck ausgelöst hat. */
  exportedByName?: string;
  cashAuditRecords?: CashAuditRecord[];
  /** Actual, completed login periods used by finalized daily-close reports. */
  staffTimeRecords?: StaffTimeRecord[];
  /** Used only by the automatic daily-close document. */
  documentTitle?: string;
  documentStatus?: string;
  receiptNumber?: string;
  /** Running deposit control total for the selected location(s) and calendar year. */
  yearlyPfandOverview?: YearlyPfandOverview;
  /** Cash figures only present on a finalized daily-close document. */
  dailyCloseCash?: {
    openingBalance: number;
    /** Taxable sales paid in cash; deposit is intentionally separate. */
    cashSales: number;
    /** Deposit collected in cash only. */
    cashPfandIncome: number;
    /** Deposit returned from the physical cash till only. */
    cashPfandPayout: number;
    cashDeposits: number;
    cashWithdrawals: number;
    /** Corrections already change the opening balance and are information only. */
    openingCorrectionTotal: number;
    balanceBeforeWithdrawal: number;
    closingWithdrawalAmount: number;
    remainingBalance: number;
  };
}

export interface YearlyPfandOverview {
  year: number;
  /** Human-readable scope, e.g. Friedrichshafen or Alle Standorte. */
  scopeLabel: string;
  pfandCollected: number;
  pfandReturned: number;
  pfandSaldo: number;
}

export interface CashAuditRecord {
  location: Location;
  timestamp: number;
  kind: 'Einlage' | 'Ausgabe' | 'Korrektur' | 'Entnahme zum Tagesabschluss';
  amount?: number;
  oldAmount?: number;
  newAmount?: number;
  reason: string;
  employeeName?: string;
}

export interface StaffTimeRecord {
  location: Location;
  staffName: string;
  loginAt: number;
  logoutAt: number;
  durationMs: number;
}

interface LocationStats {
  total: number;
  totalNet: number;
  totalTax: number;
  pfandCollected: number;
  pfandReturned: number;
  pfandSaldo: number;
  count: number;
  stornoCount: number;
  taxByRate: Record<number, number>;
}

const LOCATION_META: Record<Location, { sub: string; color: string; bar: string }> = {
  Friedrichshafen: { sub: 'Friedrichshafen', color: '#1e3a5f', bar: '#2563eb' },
  Bregenz: { sub: 'Bregenz', color: '#0f766e', bar: '#0d9488' },
};

function computeStats(txs: Transaction[]): LocationStats {
  let total = 0, totalNet = 0, pfandCollected = 0, pfandReturned = 0, count = 0, stornoCount = 0;
  const taxByRate: Record<number, number> = {};
  for (const t of txs) {
    total += t.subtotal;
    totalNet += t.totalNet;
    const reversing = (t as Partial<StornoJournalTransaction>).isStornoProjection === true;
    if (reversing) stornoCount++;
    else count++;
    for (const item of t.items) {
      if (item.isPfandRetoure) {
        const amount = Math.abs(item.pfand || item.price * item.quantity);
        pfandReturned += reversing ? -amount : amount;
      } else {
        pfandCollected += item.pfand;
      }
    }
    for (const [k, v] of getTaxByRate(t)) {
      taxByRate[k] = (taxByRate[k] ?? 0) + v;
    }
  }
  const totalTax = Object.values(taxByRate).reduce((s, v) => s + v, 0);
  return { total, totalNet, totalTax, pfandCollected, pfandReturned, pfandSaldo: pfandCollected - pfandReturned, count, stornoCount, taxByRate };
}

/**
 * Calculates the deposit control value directly from booking history.  It is
 * deliberately not stored separately: deleting bookings also resets the
 * control value without leaving an old counter behind.
 */
export function calculateYearlyPfandOverview(
  transactions: Transaction[],
  year: number,
  location: Location | 'all',
  scopeLabel = location === 'all' ? 'Alle Standorte' : location,
): YearlyPfandOverview {
  let pfandCollected = 0;
  let pfandReturned = 0;
  for (const transaction of transactions) {
    if (new Date(transaction.timestamp).getFullYear() !== year) continue;
    if (location !== 'all' && transaction.location !== location) continue;
    const reversing = (transaction as Partial<StornoJournalTransaction>).isStornoProjection === true;
    for (const item of transaction.items) {
      if (item.isPfandRetoure) {
        const amount = Math.abs(item.pfand || item.price * item.quantity);
        pfandReturned += reversing ? -amount : amount;
      } else {
        pfandCollected += item.pfand;
      }
    }
  }
  return {
    year,
    scopeLabel,
    pfandCollected,
    pfandReturned,
    pfandSaldo: Math.round((pfandCollected - pfandReturned) * 100) / 100,
  };
}

function categoryRows(txs: Transaction[], categories: Category[]): string {
  const map = new Map<string, { name: string; total: number; count: number; pfand: number }>();
  for (const tx of txs) {
    for (const item of tx.items) {
      if (isTaxFreeItem(item)) continue;
      const cat = categories.find((c) => c.id === item.categoryId);
      const key = item.categoryId;
      if (!map.has(key)) map.set(key, { name: cat?.name ?? 'Unbekannt', total: 0, count: 0, pfand: 0 });
      const g = map.get(key)!;
      g.total += item.price * item.quantity;
      g.count += item.quantity;
      g.pfand += item.pfand;
    }
  }
  return [...map.values()].sort((a, b) => b.total - a.total)
    .map((g) => `<tr><td>${escapeHtml(g.name)}</td><td style="text-align:right">${g.count}</td><td style="text-align:right">${pfandSaldoCell(g.pfand)}</td><td style="text-align:right"><b>${formatCurrency(g.total)}</b></td></tr>`)
    .join('');
}

function articleRows(txs: Transaction[]): { rows: string; bestRows: string; artMap: Map<string, { name: string; count: number; total: number; taxRate: number }> } {
  const pricesByProduct = new Map<string, Set<number>>();
  for (const tx of txs) {
    for (const item of tx.items) {
      if (item.isPfandRetoure) continue;
      const set = pricesByProduct.get(item.productId) ?? new Set<number>();
      set.add(item.price);
      pricesByProduct.set(item.productId, set);
    }
  }
  const artMap = new Map<string, { name: string; count: number; total: number; taxRate: number }>();
  for (const tx of txs) {
    for (const item of tx.items) {
      if (item.isPfandRetoure) continue;
      const key = `${item.productId}-${item.price}`;
      const variable = (pricesByProduct.get(item.productId)?.size ?? 0) > 1;
      const label = variable ? `${item.name} (${formatCurrency(item.price)})` : item.name;
      const isTaxFree = isTaxFreeItem(item);
      if (!artMap.has(key)) artMap.set(key, { name: label, count: 0, total: 0, taxRate: isTaxFree ? 0 : item.taxRate });
      const g = artMap.get(key)!;
      g.count += item.quantity;
      g.total += item.price * item.quantity;
    }
  }
  const rows = [...artMap.values()].sort((a, b) => b.total - a.total)
    .map((g) => `<tr><td>${escapeHtml(g.name)}</td><td style="text-align:right">${g.taxRate === 0 ? 'steuerfrei' : `${g.taxRate}%`}</td><td style="text-align:right">${g.count}</td><td style="text-align:right"><b>${formatCurrency(g.total)}</b></td></tr>`)
    .join('');
  const bestRows = [...artMap.values()].filter((g) => g.total > 0).sort((a, b) => b.count - a.count).slice(0, 10)
    .map((g, i) => `<tr><td>${i + 1}</td><td>${escapeHtml(g.name)}</td><td style="text-align:right">${g.count}</td><td style="text-align:right"><b>${formatCurrency(g.total)}</b></td></tr>`)
    .join('');
  return { rows, bestRows, artMap };
}

function taxCards(txs: Transaction[]): { cards: string; columns: number } {
  const taxData = new Map<number, { gross: number; net: number; tax: number; count: number }>();
  for (const tx of txs) {
    for (const item of tx.items) {
      if (isTaxFreeItem(item)) continue;
      const rate = item.taxRate;
      const gross = item.price * item.quantity;
      const g = taxData.get(rate) ?? { gross: 0, net: 0, tax: 0, count: 0 };
      g.gross += gross; g.net += item.netPrice; g.tax += item.taxAmount; g.count += item.quantity;
      taxData.set(rate, g);
    }
  }
  const sortedRates = [...taxData.keys()].sort((a, b) => a - b);
  const cards = sortedRates.map((rate) => {
    const d = taxData.get(rate)!;
    return `<div class="tax-card"><h3>MwSt ${rate}%</h3>
      <div class="row"><span>Bruttoumsatz</span><span>${formatCurrency(d.gross)}</span></div>
      <div class="row"><span>Nettoumsatz</span><span>${formatCurrency(d.net)}</span></div>
      <div class="row bold"><span>MwSt-Anteil</span><span>${formatCurrency(d.tax)}</span></div>
      <div class="row"><span>Verkaufte Menge</span><span>${d.count}</span></div></div>`;
  }).join('');
  return { cards, columns: sortedRates.length > 0 ? sortedRates.length : 2 };
}

function transactionRows(txs: Transaction[]): string {
  return [...txs].sort((a, b) => a.timestamp - b.timestamp)
    .map((tx, i) => {
      const txTax = [...getTaxByRate(tx).values()].reduce((s, v) => s + v, 0);
      const reversing = (tx as Partial<StornoJournalTransaction>).isStornoProjection === true;
      const isPfandPayout = !reversing && tx.total < 0 && tx.items.some((item) => item.isPfandRetoure);
      const kind = reversing ? 'Storno' : isPfandPayout ? 'Pfandausgabe' : tx.paymentMethod === 'cash' ? 'Bareinnahme' : 'Karteneinnahme';
      const articles = reversing
        ? `Originalbon ${String((tx as StornoJournalTransaction).stornoOriginalId)} · Grund: ${String((tx as StornoJournalTransaction).stornoReason)}`
        : tx.items.map((item) => `${item.quantity}× ${item.isPfandRetoure ? 'Pfand-Retoure' : item.name}`).join(', ');
      return `<tr><td>${i + 1}</td><td>${formatDate(tx.timestamp)}</td><td>${formatTime(tx.timestamp)}</td><td>${escapeHtml(tx.employeeName ?? '—')}</td><td>${movementBadgeHTML(kind)}</td><td>${escapeHtml(articles)}</td><td style="text-align:right">${formatCurrency(tx.total)}</td><td style="text-align:right">${formatCurrency(txTax)}</td></tr>`;
    })
    .join('');
}

function transactionSection(txs: Transaction[], title: string, color?: string): string {
  return `<section class="report-table-section table-block">
    <table class="transaction-table"><thead>${tableTitleRow(title, color)}<tr><th>#</th><th>Datum</th><th>Uhrzeit</th><th>Mitarbeiter</th><th>Vorgang</th><th>Artikel</th><th style="text-align:right">Betrag</th><th style="text-align:right">MwSt</th></tr></thead><tbody>${transactionRows(txs)}</tbody></table>
  </section>`;
}

function activityTotals(txs: Transaction[], records: CashAuditRecord[]): string {
  const cash = txs.filter(tx => tx.paymentMethod === 'cash');
  const card = txs.filter(tx => tx.paymentMethod === 'card');
  const kinds: Array<{ label: string; count: number; total: number; kind: string }> = [
    { label: 'Barbuchungen', count: cash.length, total: cash.reduce((sum, tx) => sum + tx.total, 0), kind: 'Bareinnahme' },
    { label: 'Kartenzahlungen', count: card.length, total: card.reduce((sum, tx) => sum + tx.total, 0), kind: 'Karteneinnahme' },
    { label: 'Einlagen', count: records.filter(r => r.kind === 'Einlage').length, total: records.filter(r => r.kind === 'Einlage').reduce((sum, r) => sum + (r.amount ?? 0), 0), kind: 'Einlage' },
    { label: 'Ausgaben / Entnahmen', count: records.filter(r => r.kind === 'Ausgabe' || r.kind === 'Entnahme zum Tagesabschluss').length, total: records.filter(r => r.kind === 'Ausgabe' || r.kind === 'Entnahme zum Tagesabschluss').reduce((sum, r) => sum + (r.amount ?? 0), 0), kind: 'Ausgabe' },
    { label: 'Korrekturen', count: records.filter(r => r.kind === 'Korrektur').length, total: records.filter(r => r.kind === 'Korrektur').reduce((sum, r) => sum + (r.newAmount ?? 0) - (r.oldAmount ?? 0), 0), kind: 'Korrektur' },
  ];
  return `<section class="report-table-section table-block"><table><thead>${tableTitleRow('Buchungsarten – Anzahl und Summe')}<tr><th>Vorgang</th><th style="text-align:right">Anzahl</th><th style="text-align:right">Summe</th></tr></thead><tbody>${kinds.map(k => `<tr><td>${movementBadgeHTML(k.kind)} ${k.label}</td><td style="text-align:right">${k.count}</td><td style="text-align:right">${formatCurrency(k.total)}</td></tr>`).join('')}</tbody></table><p class="audit-note">Bar- und Kartenzahlungen enthalten gegebenenfalls Pfand. Korrekturen sind Bestandsänderungen, kein Umsatz.</p></section>`;
}

function auditRows(records: CashAuditRecord[]): string {
  return [...records].sort((a, b) => a.timestamp - b.timestamp).map((record) => {
    const value = record.kind === 'Korrektur'
      ? `${formatCurrency(record.oldAmount ?? 0)} → ${formatCurrency(record.newAmount ?? 0)} (${(record.newAmount ?? 0) - (record.oldAmount ?? 0) > 0 ? '+' : ''}${formatCurrency((record.newAmount ?? 0) - (record.oldAmount ?? 0))})`
      : `${record.kind === 'Einlage' ? '+' : '-'}${formatCurrency(record.amount ?? 0)}`;
    return `<tr><td>${formatDate(record.timestamp)}</td><td>${formatTime(record.timestamp)}</td><td>${escapeHtml(record.employeeName ?? '—')}</td><td>${movementBadgeHTML(record.kind)}</td><td style="text-align:right"><b>${value}</b></td><td>${escapeHtml(record.reason)}</td></tr>`;
  }).join('');
}

function auditSection(records: CashAuditRecord[]): string {
  if (records.length === 0) return '';
  const deposits = records.filter((record) => record.kind === 'Einlage').reduce((sum, record) => sum + (record.amount ?? 0), 0);
  const withdrawals = records.filter((record) => record.kind === 'Ausgabe' || record.kind === 'Entnahme zum Tagesabschluss').reduce((sum, record) => sum + (record.amount ?? 0), 0);
  const corrections = records.filter((record) => record.kind === 'Korrektur').reduce((sum, record) => sum + (record.newAmount ?? 0) - (record.oldAmount ?? 0), 0);
  return `<section class="report-table-section table-block">
    <table class="audit-table"><thead>${tableTitleRow('Kassenbewegungen und Korrekturen')}<tr><th>Datum</th><th>Uhrzeit</th><th>Mitarbeiter</th><th>Vorgang</th><th style="text-align:right">Betrag / Änderung</th><th>Grund</th></tr></thead><tbody>${auditRows(records)}</tbody></table>
    <p class="audit-totals"><span>Summe Einlagen: + ${formatCurrency(deposits)}</span><span>Summe Ausgaben und Abschlussentnahmen: - ${formatCurrency(withdrawals)}</span><span>Anfangsbestandskorrekturen: ${corrections > 0 ? '+' : ''}${formatCurrency(corrections)}</span></p>
    <p class="audit-note">Kassenbewegungen sind kein Warenumsatz. Anfangsbestandskorrekturen sind bereits im korrigierten Anfangsbestand enthalten und werden nicht nochmals verrechnet.</p>
  </section>`;
}

function formatDuration(durationMs: number): string {
  const totalMinutes = Math.max(0, Math.round(durationMs / 60_000));
  return `${Math.floor(totalMinutes / 60)} Std. ${String(totalMinutes % 60).padStart(2, '0')} Min.`;
}

function staffTimesSection(records: StaffTimeRecord[]): string {
  if (records.length === 0) return '';
  const rows = [...records].sort((a, b) => a.loginAt - b.loginAt).map((record) =>
    `<tr><td>${escapeHtml(record.staffName)}</td><td>${formatDate(record.loginAt)}</td><td>${formatTime(record.loginAt)}</td><td>${formatDate(record.logoutAt)}</td><td>${formatTime(record.logoutAt)}</td><td>${formatDuration(record.durationMs)}</td></tr>`,
  ).join('');
  const totals = new Map<string, number>();
  for (const record of records) totals.set(record.staffName, (totals.get(record.staffName) ?? 0) + record.durationMs);
  const totalRows = [...totals.entries()].map(([name, duration]) =>
    `<div class="staff-total-row"><span>${escapeHtml(name)}: gesamte Anmeldezeit am Tag:</span><strong>${formatDuration(duration)}</strong></div>`,
  ).join('');
  return `<section class="report-table-section table-block staff-times-section">
    <table><thead>${tableTitleRow('Mitarbeiterzeiten')}<tr><th>Mitarbeiter</th><th>Anmeldung am</th><th>Uhrzeit</th><th>Abmeldung am</th><th>Uhrzeit</th><th>Gesamtzeit</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="staff-totals">${totalRows}</div>
  </section>`;
}

function pfandSaldoDisplay(saldo: number): string {
  if (saldo > 0) {
    return `<span style="color:#16a34a;font-size:22px"><b>+${formatCurrency(saldo)}</b></span>`;
  } else if (saldo < 0) {
    return `<span style="color:#dc2626;font-size:22px"><b>-${formatCurrency(Math.abs(saldo))}</b></span>`;
  }
  return `<span>${formatCurrency(0)}</span>`;
}

function pfandSaldoLabel(saldo: number): string {
  if (saldo > 0) return 'Pfandgewinn';
  if (saldo < 0) return 'Pfandverlust';
  return 'Pfandsaldo';
}

function pfandSaldoCell(saldo: number): string {
  if (saldo > 0) {
    return `<span style="color:#16a34a;font-weight:bold">+${formatCurrency(saldo)}</span>`;
  } else if (saldo < 0) {
    return `<span style="color:#dc2626;font-weight:bold">-${formatCurrency(Math.abs(saldo))}</span>`;
  }
  return formatCurrency(0);
}

function summaryCards(s: LocationStats, accentColor: string): string {
  const taxSummaryLine = Object.keys(s.taxByRate).length > 0
    ? Object.entries(s.taxByRate).map(([r, v]) => `MwSt ${r}%: ${formatCurrency(v)}`).join(' · ')
    : '—';
  return `<div class="summary-grid">
    <div class="summary-card accent"><div class="label">Umsatz (ohne Pfand)</div><div class="value" style="color:${accentColor}">${formatCurrency(s.total)}</div></div>
    <div class="summary-card"><div class="label">Netto</div><div class="value">${formatCurrency(s.totalNet)}</div></div>
    <div class="summary-card"><div class="label">MwSt gesamt</div><div class="value">${formatCurrency(s.totalTax)}</div></div>
    <div class="summary-card pfand"><div class="label">Pfand eingenommen</div><div class="value">${formatCurrency(s.pfandCollected)}</div></div>
    <div class="summary-card pfand"><div class="label">Pfand retourniert</div><div class="value">${formatCurrency(s.pfandReturned)}</div></div>
    <div class="summary-card pfand"><div class="label">${pfandSaldoLabel(s.pfandSaldo)}</div><div class="value">${pfandSaldoDisplay(s.pfandSaldo)}</div></div>
    <div class="summary-card count"><div class="label">Verkäufe / Stornos</div><div class="value">${s.count} / ${s.stornoCount}</div></div>
    <div class="summary-card"><div class="label">MwSt nach Satz</div><div class="value" style="font-size:11px">${taxSummaryLine}</div></div>
  </div>`;
}

/** Additional immutable documentary table – original and reversal are never
 * silently merged into one history row. Financial totals above use the signed
 * projections exactly once; this section only adds context, no arithmetic.
 */
function stornoAuditSection(stornos: readonly StornoRecord[]): string {
  if (!stornos.length) return '';
  const ordered = [...stornos].sort((a,b)=>a.timestamp-b.timestamp || a.id.localeCompare(b.id));
  const rows = ordered.map((row) => `<tr>
    <td>${formatDate(row.timestamp)}<div>${formatTime(row.timestamp)}</div></td>
    <td>${escapeHtml(row.location)}</td>
    <td style="overflow-wrap:anywhere">${escapeHtml(row.id)}</td>
    <td style="overflow-wrap:anywhere">${escapeHtml(row.originalTransactionId)}</td>
    <td>${escapeHtml(row.employeeName)}</td>
    <td>${escapeHtml(row.reason)}</td>
    <td>${row.paymentMethod === 'cash' ? 'Bar' : 'Karte'}</td>
    <td style="text-align:right">${formatCurrency(-row.grossAmount)}</td>
  </tr>`).join('');
  return `<section class="report-table-section table-block">
    <h2>Stornobelege (${stornos.length}) – unveränderliche Gegenbuchungen</h2>
    <p class="audit-note">Der Originalbon bleibt gespeichert. Eine Kartengutschrift erfolgt gesondert am Terminal; dieser Bericht ist kein Terminalnachweis.</p>
    <table class="transaction-table"><thead><tr><th>Datum</th><th>Standort</th><th>Storno-ID</th><th>Originalbon</th><th>Mitarbeiter</th><th>Grund</th><th>Zahlung</th><th style="text-align:right">Betrag</th></tr></thead>
    <tbody>${rows}</tbody></table></section>`;
}

function dailyCloseCashSection(cash?: JournalReportData['dailyCloseCash']): string {
  if (!cash) return '';
  const correction = cash.openingCorrectionTotal === 0
    ? ''
    : `<tr><td>Korrekturen am Anfangsbestand (bereits enthalten)</td><td style="text-align:right">${cash.openingCorrectionTotal > 0 ? '+' : '-'} ${formatCurrency(Math.abs(cash.openingCorrectionTotal))}</td></tr>`;
  return `<section class="report-table-section table-block daily-close-cash">
    <h2>Kassenbestand beim Tagesabschluss</h2>
    <table><tbody>
      <tr><td>Kassenanfangsbestand</td><td style="text-align:right"><b>${formatCurrency(cash.openingBalance)}</b></td></tr>
      <tr><td>Barumsatz</td><td style="text-align:right"><b>${formatCurrency(cash.cashSales)}</b></td></tr>
      <tr><td>Pfandeinnahmen (bar)</td><td style="text-align:right">+ ${formatCurrency(cash.cashPfandIncome)}</td></tr>
      <tr><td>Pfandretouren (bar)</td><td style="text-align:right">- ${formatCurrency(cash.cashPfandPayout)}</td></tr>
      <tr><td>Bareinlagen</td><td style="text-align:right">+ ${formatCurrency(cash.cashDeposits)}</td></tr>
      <tr><td>Barausgaben</td><td style="text-align:right">- ${formatCurrency(cash.cashWithdrawals)}</td></tr>
      ${correction}
      <tr><td>Kassenendbestand vor Entnahme</td><td style="text-align:right"><b>${formatCurrency(cash.balanceBeforeWithdrawal)}</b></td></tr>
      <tr><td>Entnahme zum Tagesabschluss</td><td style="text-align:right"><b>-${formatCurrency(cash.closingWithdrawalAmount)}</b></td></tr>
      <tr><td><b>Restbestand / nächster Anfangsbestand</b></td><td style="text-align:right"><b>${formatCurrency(cash.remainingBalance)}</b></td></tr>
    </tbody></table>
  </section>`;
}

function yearlyPfandOverviewSection(overview?: YearlyPfandOverview): string {
  if (!overview) return '';
  return `<section class="report-table-section table-block yearly-pfand-overview">
    <h2>Pfand-Kontrollübersicht ${overview.year}</h2>
    <p class="pfand-control-note">${escapeHtml(overview.scopeLabel)} · alle Buchungen im Kalenderjahr</p>
    <table><tbody>
      <tr><td>Pfandeinnahmen</td><td style="text-align:right"><b>+ ${formatCurrency(overview.pfandCollected)}</b></td></tr>
      <tr><td>Pfandretouren</td><td style="text-align:right"><b>- ${formatCurrency(overview.pfandReturned)}</b></td></tr>
      <tr><td><b>${pfandSaldoLabel(overview.pfandSaldo)}</b></td><td style="text-align:right">${pfandSaldoCell(overview.pfandSaldo)}</td></tr>
    </tbody></table>
    <p class="pfand-control-note">Der Saldo wird aus den vorhandenen Buchungen berechnet und beim Zurücksetzen der Buchungen automatisch zurückgesetzt.</p>
  </section>`;
}

function tableTitleRow(title: string, color?: string): string {
  const headingStyle = color ? ` style="color:${color}"` : '';
  // Firefox may separate a table caption from its rows at a page boundary.
  // A title row in the table header is instead kept with the column header
  // and repeated as one unit whenever the table continues on a new page.
  return `<tr class="table-title-row"><th colspan="99"${headingStyle}>${title}</th></tr>`;
}

function tableBlock(title: string, table: string, color?: string): string {
  const titleRow = tableTitleRow(title, color);
  const tableWithTitleRow = table.replace('<thead>', `<thead>${titleRow}`);
  return `<section class="table-block">${tableWithTitleRow}</section>`;
}

function locationSection(loc: Location, txs: Transaction[], categories: Category[], auditRecords: CashAuditRecord[], staffTimeRecords: StaffTimeRecord[] = [], dailyCloseCash?: JournalReportData['dailyCloseCash']): string {
  const meta = LOCATION_META[loc];
  const s = computeStats(txs);
  const cats = categoryRows(txs, categories);
  const { rows: arts, bestRows } = articleRows(txs);
  const { cards: taxCds, columns } = taxCards(txs);
  const isEmpty = txs.length === 0;

  return `<div class="loc-section" style="border-color:${meta.bar}">
    <div class="loc-header" style="background:${meta.bar}">
      <div class="loc-title">${meta.sub}</div>
      <div class="loc-sub">${txs.length} Transaktion${txs.length === 1 ? '' : 'en'} · Umsatz ${formatCurrency(s.total)}</div>
    </div>
    <div class="loc-body">
      ${dailyCloseCashSection(dailyCloseCash)}
      ${isEmpty ? `<div class="empty">Keine Verkäufe für diesen Standort im gewählten Zeitraum.</div>` : `
      ${summaryCards(s, meta.color)}
      <h2 style="color:${meta.color}">Mehrwertsteuer-Klassen</h2>
      <div class="tax-section" style="grid-template-columns: repeat(${Math.min(columns, 4)}, 1fr)">
        ${taxCds || '<div class="tax-card">Keine steuerpflichtigen Umsätze</div>'}
      </div>
      ${tableBlock('Warengruppen', `<table><thead><tr><th>Gruppe</th><th style="text-align:right">Menge</th><th style="text-align:right">Pfand</th><th style="text-align:right">Umsatz</th></tr></thead><tbody>${cats}</tbody></table>`, meta.color)}
      ${tableBlock('Einzelartikel', `<table class="article-table"><thead><tr><th>Artikel</th><th style="text-align:right">MwSt</th><th style="text-align:right">Menge</th><th style="text-align:right">Umsatz</th></tr></thead><tbody>${arts}</tbody></table>`, meta.color)}
      ${tableBlock('Bestseller (Top 10)', `<table><thead><tr><th>#</th><th>Artikel</th><th style="text-align:right">Menge</th><th style="text-align:right">Umsatz</th></tr></thead><tbody>${bestRows}</tbody></table>`, meta.color)}
      ${activityTotals(txs, auditRecords)}
      ${transactionSection(txs, `Einzel-Bons (${txs.length})`, meta.color)}
      ${auditSection(auditRecords)}
      ${staffTimesSection(staffTimeRecords)}
      `}
      ${isEmpty ? `${auditSection(auditRecords)}${staffTimesSection(staffTimeRecords)}` : ''}
    </div>
  </div>`;
}

function combinedSection(transactions: Transaction[], categories: Category[], stats: LocationStats, auditRecords: CashAuditRecord[]): string {
  const cats = categoryRows(transactions, categories);
  const { rows: arts, bestRows } = articleRows(transactions);
  const { cards: taxCds, columns } = taxCards(transactions);
  const taxSummaryLine = Object.keys(stats.taxByRate).length > 0
    ? Object.entries(stats.taxByRate).map(([r, v]) => `MwSt ${r}%: ${formatCurrency(v)}`).join(' · ')
    : '—';

  return `<div class="loc-section combined">
    <div class="loc-header combined-header">
      <div class="loc-title">Gesamtübersicht · Alle Standorte</div>
      <div class="loc-sub">${transactions.length} Transaktionen · Umsatz ${formatCurrency(stats.total)}</div>
    </div>
    <div class="loc-body">
      <div class="summary-grid">
        <div class="summary-card accent"><div class="label">Umsatz (ohne Pfand)</div><div class="value">${formatCurrency(stats.total)}</div></div>
        <div class="summary-card"><div class="label">Netto</div><div class="value">${formatCurrency(stats.totalNet)}</div></div>
        <div class="summary-card"><div class="label">MwSt gesamt</div><div class="value">${formatCurrency(stats.totalTax)}</div></div>
        <div class="summary-card pfand"><div class="label">Pfand eingenommen</div><div class="value">${formatCurrency(stats.pfandCollected)}</div></div>
        <div class="summary-card pfand"><div class="label">Pfand retourniert</div><div class="value">${formatCurrency(stats.pfandReturned)}</div></div>
        <div class="summary-card pfand"><div class="label">${pfandSaldoLabel(stats.pfandSaldo)}</div><div class="value">${pfandSaldoDisplay(stats.pfandSaldo)}</div></div>
        <div class="summary-card count"><div class="label">Verkäufe / Stornos</div><div class="value">${stats.count} / ${stats.stornoCount}</div></div>
        <div class="summary-card"><div class="label">MwSt nach Satz</div><div class="value" style="font-size:11px">${taxSummaryLine}</div></div>
      </div>
      <h2>Mehrwertsteuer-Klassen</h2>
      <div class="tax-section" style="grid-template-columns: repeat(${Math.min(columns, 4)}, 1fr)">
        ${taxCds || '<div class="tax-card">Keine steuerpflichtigen Umsätze</div>'}
      </div>
      ${tableBlock('Warengruppen', `<table><thead><tr><th>Gruppe</th><th style="text-align:right">Menge</th><th style="text-align:right">Pfand</th><th style="text-align:right">Umsatz</th></tr></thead><tbody>${cats}</tbody></table>`)}
      ${tableBlock('Einzelartikel', `<table class="article-table"><thead><tr><th>Artikel</th><th style="text-align:right">MwSt</th><th style="text-align:right">Menge</th><th style="text-align:right">Umsatz</th></tr></thead><tbody>${arts}</tbody></table>`)}
      ${tableBlock('Bestseller (Top 10)', `<table><thead><tr><th>#</th><th>Artikel</th><th style="text-align:right">Menge</th><th style="text-align:right">Umsatz</th></tr></thead><tbody>${bestRows}</tbody></table>`)}
      ${activityTotals(transactions, auditRecords)}
      ${transactionSection(transactions, `Einzel-Bons (${transactions.length})`)}
      ${auditSection(auditRecords)}
    </div>
  </div>`;
}

export function buildJournalHTML(data: JournalReportData): string {
  const { headerLabel, location, transactions, stornos = [], categories, fileName, exportedByName, cashAuditRecords = [], staffTimeRecords = [], documentTitle = 'Kassenjournal', documentStatus, receiptNumber, dailyCloseCash, yearlyPfandOverview } = data;
  const generatedAt = new Date().toLocaleString('de-DE');
  const generatedTime = new Date().toLocaleTimeString('de-DE');
  const isBregenzReport = location.toLowerCase().includes('bregenz');
  const reportAccent = isBregenzReport ? '#0f766e' : '#2563eb';

  const isBoth = location.includes('Beide') || location.includes('Kasse 1 + Kasse 2') || location.toLowerCase().includes('alle');

  let body: string;
  if (isBoth) {
    const fhTx = transactions.filter((t) => t.location === 'Friedrichshafen');
    const bgTx = transactions.filter((t) => t.location === 'Bregenz');
    const totalStats = computeStats(transactions);

    // Location comparison summary at the very top
    const fhStats = computeStats(fhTx);
    const bgStats = computeStats(bgTx);
    const compareRow = (label: string, fh: string, bg: string, total: string) =>
      `<tr><td>${label}</td><td style="text-align:right"><b>${fh}</b></td><td style="text-align:right"><b>${bg}</b></td><td style="text-align:right"><b>${total}</b></td></tr>`;

    const comparison = `<h2>Standort-Vergleich</h2>
      <table class="compare-table">
        <thead><tr><th>Kennzahl</th><th style="text-align:right">Friedrichshafen</th><th style="text-align:right">Bregenz</th><th style="text-align:right">Gesamt</th></tr></thead>
        <tbody>
          ${compareRow('Verkäufe', String(fhStats.count), String(bgStats.count), String(totalStats.count))}
          ${compareRow('Brutto-Umsatz', formatCurrency(fhStats.total), formatCurrency(bgStats.total), formatCurrency(totalStats.total))}
          ${compareRow('Netto-Umsatz', formatCurrency(fhStats.totalNet), formatCurrency(bgStats.totalNet), formatCurrency(totalStats.totalNet))}
          ${compareRow('MwSt gesamt', formatCurrency(fhStats.totalTax), formatCurrency(bgStats.totalTax), formatCurrency(totalStats.totalTax))}
          ${compareRow('Pfand eingenommen', formatCurrency(fhStats.pfandCollected), formatCurrency(bgStats.pfandCollected), formatCurrency(totalStats.pfandCollected))}
          ${compareRow('Pfand retourniert', formatCurrency(fhStats.pfandReturned), formatCurrency(bgStats.pfandReturned), formatCurrency(totalStats.pfandReturned))}
          ${compareRow('Pfand-Saldo', pfandSaldoCell(fhStats.pfandSaldo), pfandSaldoCell(bgStats.pfandSaldo), pfandSaldoCell(totalStats.pfandSaldo))}
        </tbody>
      </table>`;

    body = `${comparison}
      <div class="loc-pagebreak"></div>
      ${locationSection('Friedrichshafen', fhTx, categories, cashAuditRecords.filter((record) => record.location === 'Friedrichshafen'), staffTimeRecords.filter((record) => record.location === 'Friedrichshafen'))}
      <div class="loc-pagebreak"></div>
      ${locationSection('Bregenz', bgTx, categories, cashAuditRecords.filter((record) => record.location === 'Bregenz'), staffTimeRecords.filter((record) => record.location === 'Bregenz'))}
      <div class="loc-pagebreak"></div>
      ${combinedSection(transactions, categories, totalStats, cashAuditRecords)}`;
  } else {
    // Single location — render once with clear header
    const loc = transactions[0]?.location ?? (location.includes('Bregenz') ? 'Bregenz' : 'Friedrichshafen');
    body = locationSection(loc, transactions, categories, cashAuditRecords.filter((record) => record.location === loc), staffTimeRecords.filter((record) => record.location === loc), dailyCloseCash);
  }

  body += stornoAuditSection(stornos);

  const printTitle = fileName.replace(/\.pdf$/i, '');
  return `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8">
  <title>${escapeHtml(printTitle)}</title>
  <style>
    @page { size: A4; margin: 27mm 14mm 21mm; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Helvetica', 'Arial', sans-serif; padding: 28px; color: #1a1a1a; line-height: 1.35; }
    .header { text-align: center; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #2563eb; }
    .header h1 { font-size: 28px; color: #1e3a5f; margin-bottom: 8px; }
    .header .report-period { font-size: 17px; font-weight: 700; color: #1e3a5f; margin-bottom: 7px; }
    .header .report-details { display: flex; justify-content: center; align-items: center; gap: 14px; font-size: 17px; font-weight: 700; }
    .header .report-location, .header .report-time { color: var(--report-accent); }
    .header .report-time::before { content: '·'; color: #94a3b8; margin-right: 14px; }
    .header .report-employee { margin-top: 6px; color: #334155; font-size: 13px; font-weight: 600; }
    .print-running-header, .print-running-footer { display: none; }
    h2 { font-size: 16px; margin-top: 20px; margin-bottom: 8px; color: #1e3a5f; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; }
    caption { caption-side: top; text-align: left; font-size: 16px; font-weight: bold; margin-top: 20px; margin-bottom: 8px; color: #1e3a5f; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; }
    .table-title-row th { text-align: left; text-transform: none; font-size: 16px; color: #1e3a5f; background: transparent; border-bottom: 1px solid #cbd5e1; padding: 20px 0 8px; }
    .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 16px; }
    .summary-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; text-align: center; }
    .summary-card .label { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
    .summary-card .value { font-size: 18px; font-weight: bold; color: #1e3a5f; }
    .summary-card.accent .value { color: #2563eb; }
    .summary-card.pfand .value { color: #0d9488; }
    .summary-card.count .value { color: #16a34a; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 14px; }
    th { text-align: left; padding: 6px 8px; border-bottom: 2px solid #334155; color: #334155; font-size: 10px; text-transform: uppercase; }
    td { padding: 5px 8px; border-bottom: 1px solid #e5e7eb; }
    .audit-totals { display: flex; flex-wrap: wrap; gap: 3px 14px; margin: 4px 0 3px; font-size: 11px; line-height: 1.35; color: #334155; }
    .audit-note { margin: 0 0 10px; font-size: 10px; line-height: 1.35; color: #64748b; }
    .transaction-table th:nth-child(2), .transaction-table td:nth-child(2),
    .audit-table th:first-child, .audit-table td:first-child { white-space: nowrap; }
    .article-table td:first-child { font-size: 12px; font-weight: 600; }
    tr:nth-child(even) { background: #fafafa; }
    .compare-table th { background: #1e3a5f; color: white; }
    .compare-table td { padding: 8px; border-bottom: 1px solid #ddd; }
    .compare-table tr:nth-child(even) { background: #f1f5f9; }
    .tax-section { display: grid; gap: 16px; margin-bottom: 16px; }
    .tax-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; }
    .tax-card h3 { font-size: 13px; margin-bottom: 8px; }
    .tax-card .row { display: flex; justify-content: space-between; font-size: 12px; padding: 3px 0; }
    .tax-card .row.bold { font-weight: bold; border-top: 1px solid #ccc; margin-top: 6px; padding-top: 6px; }
    .loc-section { margin: 24px 0; border: 2px solid #ccc; border-radius: 12px; overflow: hidden; }
    .loc-header { padding: 14px 18px; color: white; display: flex; justify-content: space-between; align-items: center; }
    .loc-title { font-size: 17px; font-weight: bold; }
    .loc-sub { font-size: 12px; opacity: 0.9; }
    .loc-header.combined-header { background: #1e3a5f; }
    .loc-body { padding: 16px 18px; }
    .loc-pagebreak { page-break-after: always; height: 0; }
    .empty { padding: 24px; text-align: center; color: #94a3b8; font-size: 13px; background: #f8fafc; border-radius: 8px; }
    .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #ccc; font-size: 10px; color: #999; text-align: center; }
    .staff-totals { border: 1px solid #cbd5e1; border-radius: 6px; margin: 0 0 14px; padding: 8px 12px; }
    .staff-total-row { display: flex; justify-content: space-between; align-items: baseline; gap: 24px; padding: 5px 0; font-size: 12px; }
    .staff-total-row strong { white-space: nowrap; }
    .pfand-control-note { margin: -2px 0 7px; color: #64748b; font-size: 11px; }
    @media print {
      * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      html, body { background: #fff; }
      body { padding: 0; font-size: 10pt; }
      /* Firefox does not reliably print CSS running elements or counter(pages).
         The regular heading stays in the document flow so it is always printed. */
      .print-running-header, .print-running-footer { display: none !important; }
      .header { display: block; margin: 0 0 7mm; padding-bottom: 4mm; }
      .header h1 { font-size: 22pt; margin-bottom: 2mm; }
      .header .report-period { font-size: 13pt; margin-bottom: 2mm; }
      .header .report-details { font-size: 13pt; gap: 3mm; }
      .header .report-employee { margin-top: 2mm; font-size: 10pt; }
      .footer { display: block; margin-top: 7mm; padding-top: 3mm; font-size: 8pt; }
      .loc-section { border: 0 !important; border-radius: 0; overflow: visible; margin: 0 0 8mm; }
      .loc-header { break-after: avoid; page-break-after: avoid; border-radius: 3mm; padding: 4mm 5mm; }
      .loc-body { padding: 0; }
      .summary-grid { grid-template-columns: repeat(3, 1fr); gap: 3mm; margin: 4mm 0 5mm; break-inside: avoid; page-break-inside: avoid; }
      .summary-card, .tax-card { break-inside: avoid; page-break-inside: avoid; border-radius: 3mm; padding: 3mm; }
      .summary-card .label { font-size: 8pt; }
      .summary-card .value { font-size: 14pt; }
      .tax-section { gap: 3mm; margin-bottom: 4mm; break-inside: avoid; page-break-inside: avoid; }
      .tax-card .row { font-size: 9pt; }
      h2 { break-after: avoid; page-break-after: avoid; margin-top: 5mm; margin-bottom: 2mm; font-size: 13pt; }
      caption { text-align: left; break-after: avoid; page-break-after: avoid; margin-top: 5mm; margin-bottom: 2mm; font-size: 13pt; font-weight: bold; color: #1e3a5f; }
      .table-title-row th { font-size: 13pt; padding: 5mm 0 2mm; }
      /* Tabellenüberschrift und Tabellenbeginn bleiben zusammen. Bei sehr
         langen Tabellen darf der Browser anschließend sauber weiter umbrechen. */
      .table-block, .report-table-section { break-inside: avoid; page-break-inside: avoid; }
      .report-table-section > h2 { break-after: avoid; page-break-after: avoid; }
      .staff-times-section { break-inside: avoid; page-break-inside: avoid; }
      .staff-totals { margin-bottom: 4mm; padding: 2mm 3mm; }
      .staff-total-row { gap: 10mm; padding: 1mm 0; font-size: 9.5pt; }
      .pfand-control-note { font-size: 8.5pt; }
      table { margin-bottom: 4mm; font-size: 9.5pt; }
      thead { display: table-header-group; }
      tr, td, th { break-inside: avoid; page-break-inside: avoid; }
      th { padding: 2mm 2.5mm; }
      td { padding: 1.5mm 2.5mm; }
      .audit-totals { font-size: 8.5pt; }
      .audit-note { font-size: 8pt; }
      .article-table td:first-child { font-size: 10.5pt; }
      .loc-pagebreak { break-after: page; page-break-after: always; height: 0; }
    }
  </style></head><body>
  <div class="print-running-header"><strong>${escapeHtml(documentTitle)}</strong><span>${escapeHtml(headerLabel)} · ${escapeHtml(location)}</span></div>
  <div class="print-running-footer"><span>${escapeHtml(documentTitle)} automatisch generiert · ${generatedAt}</span><span class="page-count"></span></div>
  <div class="header" style="--report-accent:${reportAccent}"${documentTitle === 'Tagesabschluss' ? ` data-pdf-page-header="${escapeHtml(`${documentTitle} · ${headerLabel}`)}" data-pdf-page-location="${escapeHtml(location)}"` : ''}>
    ${documentStatus ? `<div class="report-employee"><strong>${escapeHtml(documentStatus)}</strong></div>` : ''}
    <h1>${escapeHtml(documentTitle)}</h1>
    <div class="report-period">${escapeHtml(headerLabel)}</div>
    <div class="report-details">
      ${location ? `<span class="report-location">${escapeHtml(location)}</span>` : ''}
      <span class="report-time">${generatedTime} Uhr</span>
    </div>
    <div class="report-employee">Mitarbeiter: ${escapeHtml(exportedByName ?? 'Nicht angemeldet')}${receiptNumber ? ` · Belegnummer: ${escapeHtml(receiptNumber)}` : ''}</div>
  </div>
  ${body}
  ${yearlyPfandOverviewSection(yearlyPfandOverview)}
  <div class="footer">${escapeHtml(documentTitle)} automatisch generiert | ${generatedAt}</div>
  </body></html>`;
}
