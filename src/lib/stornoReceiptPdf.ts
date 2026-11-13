import type { StornoRecord } from './stornoRules';
import type { JournalReportData } from './journalPdf';
import { formatCurrency } from './format';
import { escapeHtml } from './escapeHtml';
import { exportAuditDocumentPdf } from './journalPdfFile';

const eur = (n: number) => escapeHtml(formatCurrency(n));
const dateTime = (ts: number) => new Date(ts).toLocaleString('de-DE', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
});
export function stornoDocumentName(storno: StornoRecord, simulation = false): string {
  const id = storno.id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48);
  return `${storno.location}_${new Date(storno.timestamp).toISOString().slice(0, 10)}_Stornobeleg_${id}${simulation ? '_TEST' : ''}.pdf`;
}

export function buildStornoDocumentHTML(storno: StornoRecord, simulation = false): string {
  const original = storno.originalSnapshot;
  if (original.id !== storno.originalTransactionId || original.paymentMethod !== storno.paymentMethod ||
      original.location !== storno.location ||
      Math.round(original.total * 100) !== Math.round(storno.grossAmount * 100)) {
    throw new Error('Stornobeleg ist nicht konsistent mit dem Originalbon.');
  }
  const lines = original.items.map((item) => `<tr>
    <td>${escapeHtml(item.name)}</td>
    <td class="num">${escapeHtml(String(-item.quantity))}</td>
    <td class="num">${escapeHtml(String(item.taxRate))}%</td>
    <td class="num">${eur(-item.price * item.quantity)}</td>
    <td class="num">${eur(-item.pfand)}</td>
  </tr>`).join('');
  const taxRows = Object.entries(original.taxByRate).sort((a,b)=>Number(a[0])-Number(b[0]))
    .map(([rate,tax])=>`<tr><th>MwSt ${escapeHtml(rate)}%</th><td class="num">${eur(-tax)}</td></tr>`).join('');
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"/>
  <title>${escapeHtml(stornoDocumentName(storno, simulation))}</title>
  <style>
  * { box-sizing:border-box; } html,body { padding:0; margin:0; background:white; font-family:Arial,Helvetica,sans-serif; color:#172b3e; }
  body { width:900px; padding:35px 42px; font-size:15px; line-height:1.45; }
  h1 { font-size:26px; margin:6px 0 2px; color:#0e5a6c } h2 { font-size:18px; margin:25px 0 9px; }
  .brand { font-weight:800; font-size:19px; letter-spacing:.09em; } .sub { color:#526475; margin-bottom:24px; }
  .flag { padding:12px; border:2px solid ${simulation ? '#a16207' : '#0f766e'}; border-radius:9px; background:${simulation ? '#fffbeb' : '#f0fdfa'}; font-weight:700; }
  dl { display:grid; grid-template-columns:190px 1fr; column-gap:10px; row-gap:7px; }
  dt { color:#526475 } dd { margin:0; overflow-wrap:anywhere; }
  table { border-collapse:collapse; width:100%; } th,td { padding:9px 7px; border-bottom:1px solid #d5e0e4; text-align:left; }
  thead th { background:#f0fdfa } .num { text-align:right } .summary { max-width:380px; margin-left:auto; }
  .negative { font-weight:800; color:#aa2334 } .foot { margin-top:24px; padding-top:16px; border-top:2px solid #d5e0e4; color:#526475; font-size:12px; }
  .report-table-section { break-inside:avoid-page; } .flag,.foot { break-inside:avoid; }
  </style></head><body>
  <div class="brand">WOODMO · Kassen-App 3.0</div>
  <h1>Stornobeleg${simulation ? ' – TESTMODUS' : ''}</h1>
  <p class="sub">${escapeHtml(storno.location)} · Gegenbuchung mit Originalbeleg-Verknüpfung</p>
  <div class="flag">${simulation ? 'SIMULATION – Nicht gebucht, keine Cloud-Wirkung' : 'STORNIERT – Originalbon bleibt unverändert erhalten'}</div>
  <h2>Nachweis</h2>
  <dl>
    <dt>Storno-ID</dt><dd>${escapeHtml(storno.id)}</dd>
    <dt>Originalbon</dt><dd>${escapeHtml(storno.originalTransactionId)}</dd>
    <dt>Kassensitzung</dt><dd>${escapeHtml(storno.cashSessionId)}</dd>
    <dt>Ursprünglich am</dt><dd>${escapeHtml(dateTime(original.timestamp))}</dd>
    <dt>Stornozeitpunkt</dt><dd>${escapeHtml(dateTime(storno.timestamp))}</dd>
    <dt>Mitarbeiter</dt><dd>${escapeHtml(storno.employeeName)}</dd>
    <dt>Begründung</dt><dd>${escapeHtml(storno.reason)}</dd>
    <dt>Zahlungsart</dt><dd>${storno.paymentMethod === 'cash' ? 'Bar' : 'Karte'}</dd>
  </dl>
  <section class="report-table-section"><h2>Stornierte Positionen (negative Gegenbuchung)</h2>
  <table><thead><tr><th>Artikel</th><th class="num">Menge</th><th class="num">Steuer</th><th class="num">Brutto ohne Pfand</th><th class="num">Pfand</th></tr></thead>
  <tbody>${lines}</tbody></table></section>
  <section class="report-table-section"><h2>Finanzielle Wirkung</h2>
  <table class="summary"><tbody>
    <tr><th>Umsatz brutto ohne Pfand</th><td class="num">${eur(-original.subtotal)}</td></tr>
    <tr><th>Umsatz netto</th><td class="num">${eur(-original.totalNet)}</td></tr>
    ${taxRows}
    <tr><th>Pfand</th><td class="num">${eur(-original.totalPfand)}</td></tr>
    <tr><th>Gesamter Stornobetrag</th><td class="num negative">${eur(-original.total)}</td></tr>
    <tr><th>Auswirkung Bargeldbestand</th><td class="num">${eur(storno.cashEffect)}</td></tr>
    <tr><th>Auswirkung Kartenumsatz</th><td class="num">${eur(storno.cardEffect)}</td></tr>
  </tbody></table></section>
  <p class="foot">Dieser Beleg dokumentiert eine eigenständige Gegenbuchung. Der Originalbon bleibt erhalten.
  ${storno.paymentMethod === 'card' ? 'ACHTUNG: Dieser Stornobeleg bestätigt keine tatsächliche Erstattung am Kartenterminal. Eine Kartengutschrift ist gesondert durchzuführen und nachzuweisen.' : 'Ein Barausgang muss durch den tatsächlichen Bargeldbestand gedeckt sein.'}
  ${simulation ? 'Im Testmodus nicht rechtswirksam gebucht.' : 'Aufbewahrung gemäß dem geltenden Dokumentationskonzept erforderlich.'}</p>
  </body></html>`;
}

export async function exportStornoDocument(storno: StornoRecord, simulation = false): Promise<boolean> {
  const report: JournalReportData = {
    headerLabel: 'Stornobeleg',
    location: storno.location,
    transactions: [],
    categories: [],
    documentTitle: 'Stornobeleg',
    fileName: stornoDocumentName(storno, simulation),
    reportPeriodStart: storno.timestamp,
  };
  return exportAuditDocumentPdf(report, buildStornoDocumentHTML(storno, simulation));
}
