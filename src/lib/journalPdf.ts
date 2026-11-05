import type { Category, Transaction, Location } from '@/types';
import { formatCurrency, formatDate, formatTime } from '@/lib/format';
import { isTaxFreeItem, getTaxByRate } from '@/lib/tax';
import { escapeHtml } from '@/lib/escapeHtml';

export interface JournalReportData {
  headerLabel: string;
  location: string;
  transactions: Transaction[];
  categories: Category[];
  fileName: string;
}

interface LocationStats {
  total: number;
  totalNet: number;
  totalTax: number;
  pfandCollected: number;
  pfandReturned: number;
  pfandSaldo: number;
  count: number;
  taxByRate: Record<number, number>;
}

const LOCATION_META: Record<Location, { sub: string; color: string; bar: string }> = {
  Friedrichshafen: { sub: 'Friedrichshafen', color: '#1e3a5f', bar: '#2563eb' },
  Bregenz: { sub: 'Bregenz', color: '#0f766e', bar: '#0d9488' },
};

function computeStats(txs: Transaction[]): LocationStats {
  let total = 0, totalNet = 0, pfandCollected = 0, pfandReturned = 0, count = 0;
  const taxByRate: Record<number, number> = {};
  for (const t of txs) {
    total += t.subtotal;
    totalNet += t.totalNet;
    count++;
    for (const item of t.items) {
      if (item.isPfandRetoure) {
        pfandReturned += Math.abs(item.pfand);
      } else {
        pfandCollected += item.pfand;
      }
    }
    for (const [k, v] of getTaxByRate(t)) {
      taxByRate[k] = (taxByRate[k] ?? 0) + v;
    }
  }
  const totalTax = Object.values(taxByRate).reduce((s, v) => s + v, 0);
  return { total, totalNet, totalTax, pfandCollected, pfandReturned, pfandSaldo: pfandCollected - pfandReturned, count, taxByRate };
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
      return `<tr><td>${i + 1}</td><td>${formatDate(tx.timestamp)} ${formatTime(tx.timestamp)}</td><td>${tx.items.length}</td><td style="text-align:right">${formatCurrency(tx.total)}</td><td style="text-align:right">${formatCurrency(txTax)}</td><td>${tx.paymentMethod === 'cash' ? 'BAR' : 'KARTE'}</td></tr>`;
    })
    .join('');
}

function pfandSaldoDisplay(saldo: number): string {
  if (saldo > 0) {
    return `<span style="color:#16a34a;font-size:22px"><b>+${formatCurrency(saldo)}</b></span>`;
  } else if (saldo < 0) {
    return `<span style="color:#dc2626;font-size:22px"><b>-${formatCurrency(Math.abs(saldo))}</b></span>`;
  }
  return `<span>${formatCurrency(0)}</span>`;
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
    <div class="summary-card pfand"><div class="label">Pfand-Saldo</div><div class="value">${pfandSaldoDisplay(s.pfandSaldo)}</div></div>
    <div class="summary-card count"><div class="label">Verkäufe</div><div class="value">${s.count}</div></div>
    <div class="summary-card"><div class="label">MwSt nach Satz</div><div class="value" style="font-size:11px">${taxSummaryLine}</div></div>
  </div>`;
}

function locationSection(loc: Location, txs: Transaction[], categories: Category[]): string {
  const meta = LOCATION_META[loc];
  const s = computeStats(txs);
  const cats = categoryRows(txs, categories);
  const { rows: arts, bestRows } = articleRows(txs);
  const { cards: taxCds, columns } = taxCards(txs);
  const txRows = transactionRows(txs);
  const isEmpty = txs.length === 0;

  return `<div class="loc-section" style="border-color:${meta.bar}">
    <div class="loc-header" style="background:${meta.bar}">
      <div class="loc-title">${meta.sub}</div>
      <div class="loc-sub">${txs.length} Transaktion${txs.length === 1 ? '' : 'en'} · Umsatz ${formatCurrency(s.total)}</div>
    </div>
    <div class="loc-body">
      ${isEmpty ? `<div class="empty">Keine Verkäufe für diesen Standort im gewählten Zeitraum.</div>` : `
      ${summaryCards(s, meta.color)}
      <h2 style="color:${meta.color}">Mehrwertsteuer-Klassen</h2>
      <div class="tax-section" style="grid-template-columns: repeat(${Math.min(columns, 4)}, 1fr)">
        ${taxCds || '<div class="tax-card">Keine steuerpflichtigen Umsätze</div>'}
      </div>
      <h2 style="color:${meta.color}">Warengruppen</h2>
      <table><thead><tr><th>Gruppe</th><th style="text-align:right">Menge</th><th style="text-align:right">Pfand</th><th style="text-align:right">Umsatz</th></tr></thead><tbody>${cats}</tbody></table>
      <h2 style="color:${meta.color}">Einzelartikel</h2>
      <table><thead><tr><th>Artikel</th><th style="text-align:right">MwSt</th><th style="text-align:right">Menge</th><th style="text-align:right">Umsatz</th></tr></thead><tbody>${arts}</tbody></table>
      <h2 style="color:${meta.color}">Bestseller (Top 10)</h2>
      <table><thead><tr><th>#</th><th>Artikel</th><th style="text-align:right">Menge</th><th style="text-align:right">Umsatz</th></tr></thead><tbody>${bestRows}</tbody></table>
      <h2 style="color:${meta.color}">Einzel-Bons (${txs.length})</h2>
      <table><thead><tr><th>#</th><th>Datum/Zeit</th><th>Artikel</th><th style="text-align:right">Betrag</th><th style="text-align:right">MwSt</th><th>Zahlart</th></tr></thead><tbody>${txRows}</tbody></table>
      `}
    </div>
  </div>`;
}

function combinedSection(transactions: Transaction[], categories: Category[], stats: LocationStats): string {
  const cats = categoryRows(transactions, categories);
  const { rows: arts, bestRows } = articleRows(transactions);
  const { cards: taxCds, columns } = taxCards(transactions);
  const txRows = transactionRows(transactions);
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
        <div class="summary-card pfand"><div class="label">Pfand-Saldo</div><div class="value">${pfandSaldoDisplay(stats.pfandSaldo)}</div></div>
        <div class="summary-card count"><div class="label">Verkäufe</div><div class="value">${stats.count}</div></div>
        <div class="summary-card"><div class="label">MwSt nach Satz</div><div class="value" style="font-size:11px">${taxSummaryLine}</div></div>
      </div>
      <h2>Mehrwertsteuer-Klassen</h2>
      <div class="tax-section" style="grid-template-columns: repeat(${Math.min(columns, 4)}, 1fr)">
        ${taxCds || '<div class="tax-card">Keine steuerpflichtigen Umsätze</div>'}
      </div>
      <h2>Warengruppen</h2>
      <table><thead><tr><th>Gruppe</th><th style="text-align:right">Menge</th><th style="text-align:right">Pfand</th><th style="text-align:right">Umsatz</th></tr></thead><tbody>${cats}</tbody></table>
      <h2>Einzelartikel</h2>
      <table><thead><tr><th>Artikel</th><th style="text-align:right">MwSt</th><th style="text-align:right">Menge</th><th style="text-align:right">Umsatz</th></tr></thead><tbody>${arts}</tbody></table>
      <h2>Bestseller (Top 10)</h2>
      <table><thead><tr><th>#</th><th>Artikel</th><th style="text-align:right">Menge</th><th style="text-align:right">Umsatz</th></tr></thead><tbody>${bestRows}</tbody></table>
      <h2>Einzel-Bons (${transactions.length})</h2>
      <table><thead><tr><th>#</th><th>Datum/Zeit</th><th>Artikel</th><th style="text-align:right">Betrag</th><th style="text-align:right">MwSt</th><th>Zahlart</th></tr></thead><tbody>${txRows}</tbody></table>
    </div>
  </div>`;
}

export function buildJournalHTML(data: JournalReportData): string {
  const { headerLabel, location, transactions, categories } = data;
  const generatedAt = new Date().toLocaleString('de-DE');

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
      ${locationSection('Friedrichshafen', fhTx, categories)}
      <div class="loc-pagebreak"></div>
      ${locationSection('Bregenz', bgTx, categories)}
      <div class="loc-pagebreak"></div>
      ${combinedSection(transactions, categories, totalStats)}`;
  } else {
    // Single location — render once with clear header
    const loc = transactions[0]?.location ?? (location.includes('Bregenz') ? 'Bregenz' : 'Friedrichshafen');
    body = locationSection(loc, transactions, categories);
  }

  return `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8">
  <title>${escapeHtml(headerLabel)}</title>
  <style>
    @page { size: A4; margin: 15mm; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Helvetica', 'Arial', sans-serif; padding: 40px; color: #1a1a1a; line-height: 1.5; }
    .header { text-align: center; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #2563eb; }
    .header h1 { font-size: 24px; color: #1e3a5f; margin-bottom: 4px; }
    .header .meta { font-size: 12px; color: #666; }
    h2 { font-size: 15px; margin-top: 24px; margin-bottom: 10px; color: #1e3a5f; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
    .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 16px; }
    .summary-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; text-align: center; }
    .summary-card .label { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
    .summary-card .value { font-size: 18px; font-weight: bold; color: #1e3a5f; }
    .summary-card.accent .value { color: #2563eb; }
    .summary-card.pfand .value { color: #0d9488; }
    .summary-card.count .value { color: #16a34a; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 16px; }
    th { text-align: left; padding: 6px 8px; border-bottom: 2px solid #333; color: #333; font-size: 10px; text-transform: uppercase; }
    td { padding: 4px 8px; border-bottom: 1px solid #eee; }
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
    @media print { body { padding: 20px; } .summary-grid { grid-template-columns: repeat(6, 1fr); } .loc-pagebreak { page-break-after: always; } }
  </style></head><body>
  <div class="header">
    <h1>Kassenjournal</h1>
    <div class="meta">${escapeHtml(headerLabel)}${location ? ` | Standort: ${escapeHtml(location)}` : ''} | Erstellt: ${generatedAt}</div>
  </div>
  ${body}
  <div class="footer">Kassenjournal automatisch generiert | ${generatedAt}</div>
  </body></html>`;
}
