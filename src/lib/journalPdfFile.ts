import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { buildJournalHTML, type JournalReportData } from '@/lib/journalPdf';
import { getWeekNumber } from '@/lib/format';
import type { Location } from '@/types';

const MONTHS_SHORT = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const ALL_LABEL = 'Alle-Standorte';
const RENDER_WIDTH_PX = 900;
const PDF_MARGIN_X_MM = 14;
const PDF_CONTENT_TOP_MM = 14;
const PDF_CONTENT_BOTTOM_MM = 20;

export type JournalKind = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';

function dmy(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
}

function journalPart(kind: JournalKind, start: number, end: number): string {
  const d = new Date(start);
  switch (kind) {
    case 'daily': return `Tagesjournal_${dmy(start)}`;
    case 'weekly': return `Wochenjournal_KW${getWeekNumber(start)}`;
    case 'monthly': return `Monatsjournal_${MONTHS_SHORT[d.getMonth()]}-${d.getFullYear()}`;
    case 'yearly': return `Jahresjournal_${d.getFullYear()}`;
    case 'custom': return `Journal_${dmy(start)}_bis_${dmy(end)}`;
  }
}

export function buildJournalFileName(kind: JournalKind, start: number, end: number, location: Location | 'all'): string {
  const ort = location === 'all' ? ALL_LABEL : location;
  return `${ort}_${journalPart(kind, start, end)}.pdf`;
}

type SaveFilePicker = (options: {
  suggestedName: string;
  startIn: 'desktop';
  types: { description: string; accept: Record<string, string[]> }[];
}) => Promise<FileSystemFileHandle>;

type DirectoryPicker = (options: {
  id: string;
  mode: 'readwrite';
  startIn: 'desktop';
}) => Promise<FileSystemDirectoryHandle>;

type WritableDirectoryHandle = FileSystemDirectoryHandle & {
  queryPermission?: (options: { mode: 'readwrite' }) => Promise<PermissionState>;
  requestPermission?: (options: { mode: 'readwrite' }) => Promise<PermissionState>;
};

const EXPORT_FOLDER_DB = 'holzbar-journal-export';
const EXPORT_FOLDER_STORE = 'settings';
const EXPORT_FOLDER_KEY = 'base-folder';

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

function openExportFolderDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(EXPORT_FOLDER_DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(EXPORT_FOLDER_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function loadExportFolder(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openExportFolderDatabase();
    return await new Promise((resolve, reject) => {
      const request = db.transaction(EXPORT_FOLDER_STORE, 'readonly').objectStore(EXPORT_FOLDER_STORE).get(EXPORT_FOLDER_KEY);
      request.onsuccess = () => resolve((request.result as FileSystemDirectoryHandle | undefined) ?? null);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return null;
  }
}

async function rememberExportFolder(folder: FileSystemDirectoryHandle): Promise<void> {
  try {
    const db = await openExportFolderDatabase();
    await new Promise<void>((resolve, reject) => {
      const request = db.transaction(EXPORT_FOLDER_STORE, 'readwrite').objectStore(EXPORT_FOLDER_STORE).put(folder, EXPORT_FOLDER_KEY);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch {
    // Saving the folder reference is a convenience only. The export itself
    // still works when a browser does not allow it to be remembered.
  }
}

async function canWrite(folder: WritableDirectoryHandle): Promise<boolean> {
  try {
    const permission = await folder.queryPermission?.({ mode: 'readwrite' });
    if (permission === 'granted') return true;
    return (await folder.requestPermission?.({ mode: 'readwrite' })) === 'granted';
  } catch {
    return false;
  }
}

async function chooseExportFolder(): Promise<FileSystemDirectoryHandle | null | undefined> {
  const picker = (window as Window & { showDirectoryPicker?: DirectoryPicker }).showDirectoryPicker;
  if (!picker) return undefined;

  const stored = await loadExportFolder();
  if (stored && await canWrite(stored as WritableDirectoryHandle)) return stored;

  try {
    // Browsers always require this explicit user choice. The picker opens at
    // the Desktop on first use; all journal folders are created beneath it.
    const selected = await picker({ id: 'holzbar-journal-exports', mode: 'readwrite', startIn: 'desktop' });
    await rememberExportFolder(selected);
    return selected;
  } catch (err) {
    if (isAbortError(err)) return null;
    return undefined;
  }
}

function exportFolderNames(location: string): { yearFolder: string; dayFolder: string; locationFolder: string } {
  const now = new Date();
  const year = now.getFullYear();
  const yyyyMmDd = `${year}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const locationFolder = location.toLowerCase().includes('alle') || location.toLowerCase().includes('beide')
    ? 'Alle Standorte'
    : location.includes('Bregenz') ? 'Bregenz' : 'Friedrichshafen';
  return { yearFolder: `Kasse Weihnachten ${year}`, dayFolder: yyyyMmDd, locationFolder };
}

async function saveIntoJournalFolder(folder: FileSystemDirectoryHandle, data: JournalReportData, blob: Blob): Promise<void> {
  const names = exportFolderNames(data.location);
  const year = await folder.getDirectoryHandle(names.yearFolder, { create: true });
  const day = await year.getDirectoryHandle(names.dayFolder, { create: true });
  const location = await day.getDirectoryHandle(names.locationFolder, { create: true });
  const file = await location.getFileHandle(data.fileName, { create: true });
  const stream = await file.createWritable();
  await stream.write(blob);
  await stream.close();
}

function waitForLoad(iframe: HTMLIFrameElement): Promise<void> {
  return new Promise((resolve, reject) => {
    iframe.onload = () => resolve();
    iframe.onerror = () => reject(new Error('Das Journal konnte nicht für den PDF-Export vorbereitet werden.'));
  });
}

type ProtectedTableBlock = {
  /** First pixel of the section heading. */
  start: number;
  /** Bottom edge of the table heading plus its first visible content row. */
  requiredEnd: number;
  end: number;
};

function relativeTop(element: Element, bodyRect: DOMRect): number {
  return Math.round(element.getBoundingClientRect().top - bodyRect.top);
}

function relativeBottom(element: Element, bodyRect: DOMRect): number {
  return Math.round(element.getBoundingClientRect().bottom - bodyRect.top);
}

/**
 * Returns the table which belongs to a section title. Some journal sections
 * already have a wrapper, while compact sections such as "Bestseller" place
 * an h2 directly before the table. Both forms must be protected equally.
 */
function tableForHeading(heading: HTMLElement): HTMLTableElement | null {
  let sibling = heading.nextElementSibling;
  while (sibling) {
    if (sibling instanceof HTMLHeadingElement) return null;
    if (sibling instanceof HTMLTableElement) return sibling;
    const table = sibling.querySelector('table');
    if (table instanceof HTMLTableElement) return table;
    sibling = sibling.nextElementSibling;
  }
  return null;
}

/**
 * Finds title + table combinations that must never be split before their
 * first visible content row. This is calculated from the real print DOM,
 * because the PDF itself is produced from a canvas and does not honour CSS
 * page-break rules while being sliced into pages.
 */
function protectedTableBlocks(doc: Document, bodyRect: DOMRect): ProtectedTableBlock[] {
  const blocks = new Map<number, ProtectedTableBlock>();

  const add = (title: Element | null, table: HTMLTableElement | null) => {
    if (!title || !table) return;
    const start = relativeTop(title, bodyRect);
    const firstRow = table.querySelector('tbody tr');
    // An empty table still has an explanatory row ("Keine …"). If a report
    // ever has no tbody row, keep its table header with the title as well.
    const requiredEnd = firstRow
      ? relativeBottom(firstRow, bodyRect)
      : relativeBottom(table.querySelector('thead') ?? table, bodyRect);
    const existing = blocks.get(start);
    if (!existing || requiredEnd > existing.requiredEnd) blocks.set(start, { start, requiredEnd, end: relativeBottom(table, bodyRect) });
  };

  // Wrapped sections are used by the journal and the daily-close report.
  for (const section of doc.querySelectorAll<HTMLElement>('.report-table-section, .report-block, .staff-times')) {
    const table = section.querySelector<HTMLTableElement>('table');
    // Journal table titles are intentionally part of the THEAD. Unlike an h2
    // this is print-safe, so it must also be the protected break anchor.
    add(table?.querySelector('.table-title-row') ?? section.querySelector<HTMLElement>('h2'), table);
  }

  // Legacy/daily-close sections still use a regular h2 before their table.
  for (const heading of doc.querySelectorAll<HTMLElement>('h2')) add(heading, tableForHeading(heading));

  // Compact journal tables (for example Bestseller) have no external h2:
  // their title is a THEAD row. Add every such table explicitly so a page is
  // always cut before the title row, never between title and first data row.
  for (const table of doc.querySelectorAll<HTMLTableElement>('table')) {
    add(table.querySelector('.table-title-row'), table);
  }

  return [...blocks.values()].sort((a, b) => a.start - b.start);
}

/**
 * Determines page breaks at real content boundaries before any bitmap is
 * sliced. A title, its table header and the first row are treated as one
 * unit, preventing isolated table titles at the bottom of a page.
 */
type PageSlice = { from: number; until: number; header?: { start: number; end: number } };

function getSafePages(doc: Document, maxPageHeightPx: number): PageSlice[] {
  const body = doc.body;
  const bodyRect = body.getBoundingClientRect();
  const totalHeight = Math.ceil(Math.max(body.scrollHeight, bodyRect.height));
  const candidates = [...doc.querySelectorAll<HTMLElement>('.loc-header, .summary-grid, .tax-section, h2, tr, table, .empty, .batch-pagebreak')]
    .flatMap((el) => [relativeTop(el, bodyRect), relativeBottom(el, bodyRect)])
    .filter((top) => top > 0 && top < totalHeight)
    .sort((a, b) => a - b);
  const tableBlocks = protectedTableBlocks(doc, bodyRect);
  // Keep a short document footer with the final table instead of creating a
  // nearly empty extra page just for the "automatisch generiert" line.
  const footer = doc.querySelector('.footer');
  const lastTable = [...tableBlocks].sort((a, b) => b.end - a.end)[0];
  if (footer && lastTable) {
    const footerEnd = relativeBottom(footer, bodyRect);
    if (relativeTop(footer, bodyRect) >= lastTable.end && footerEnd - lastTable.start <= maxPageHeightPx) lastTable.end = footerEnd;
  }
  const tables = [...doc.querySelectorAll<HTMLTableElement>('table')].flatMap(table => {
    const head = table.querySelector('thead');
    return head ? [{ start: relativeTop(head, bodyRect), end: relativeBottom(head, bodyRect), tableEnd: relativeBottom(table, bodyRect) }] : [];
  });
  // Unlike browser printing, canvas slicing does not repeat THEAD automatically.
  const rows = [...doc.querySelectorAll('tr')].map(row => ({ start: relativeTop(row, bodyRect), end: relativeBottom(row, bodyRect) }));

  const pages: PageSlice[] = [];
  let from = 0;
  while (from < totalHeight) {
    const head = tables.find(table => from >= table.end && from < table.tableEnd);
    const header = head && head.end - head.start < maxPageHeightPx / 2 ? { start: head.start, end: head.end } : undefined;
    const capacity = maxPageHeightPx - (header ? header.end - header.start : 0);
    const target = Math.min(from + capacity, totalHeight);
    if (target === totalHeight) {
      pages.push({ from, until: totalHeight, header });
      break;
    }

    // Short tables move as a whole; long tables protect title + first row.
    const protectedRanges = tableBlocks.map(block => ({ start: block.start,
      end: block.end - block.start <= maxPageHeightPx ? block.end : block.requiredEnd,
    }));
    const unbrokenRows = rows.filter(row => row.end - row.start <= capacity);
    const isSafe = (point: number) => ![...protectedRanges, ...unbrokenRows]
      .some(block => point > block.start && point < block.end);
    const safe = candidates.filter(point => point > from && point <= target && isSafe(point)).pop();
    const next = safe ?? target;
    pages.push({ from, until: next, header });
    from = next;
  }
  return pages;
}

/** Renders HTML into a real PDF with stable, printed page numbers. */
export async function renderPdfHtml(html: string): Promise<Blob> {
  const iframe = document.createElement('iframe');
  iframe.style.cssText = `position:fixed;left:-10000px;top:0;width:${RENDER_WIDTH_PX}px;height:1200px;border:0;background:#fff`;
  iframe.srcdoc = html;
  document.body.appendChild(iframe);

  try {
    await waitForLoad(iframe);
    const doc = iframe.contentDocument;
    const body = doc?.body;
    if (!doc || !body) throw new Error('Das Journal konnte nicht gerendert werden.');
    // The measurement iframe is shorter than a multi-page document. Its
    // scrollbar must not reduce the layout width: html2canvas's tall clone
    // has no scrollbar and would otherwise wrap text differently after cuts
    // have already been measured (even clipping headings at page boundaries).
    doc.documentElement.style.overflow = 'hidden';
    await doc.fonts.ready;

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const contentWidth = pageWidth - PDF_MARGIN_X_MM * 2;
    const contentHeight = pageHeight - PDF_CONTENT_TOP_MM - PDF_CONTENT_BOTTOM_MM;
    const maxPageHeightPx = Math.floor(contentHeight / (contentWidth / RENDER_WIDTH_PX));
    let pages: PageSlice[] = [];

    const canvas = await html2canvas(body, {
      scale: 2,
      width: RENDER_WIDTH_PX,
      windowWidth: RENDER_WIDTH_PX,
      windowHeight: Math.max(body.scrollHeight, 1200),
      backgroundColor: '#ffffff',
      useCORS: true,
      // Measure the very DOM that is rasterized. html2canvas may reflow a
      // cloned table; measuring the original can cut through a title instead.
      onclone: (renderDoc) => { pages = getSafePages(renderDoc, maxPageHeightPx); },
    });
    const canvasScale = canvas.width / RENDER_WIDTH_PX;

    pages.forEach(({ from, until, header }, index) => {
      if (index > 0) pdf.addPage();
      const slice = document.createElement('canvas');
      slice.width = canvas.width;
      const headerHeight = header ? Math.round((header.end - header.start) * canvasScale) : 0;
      const contentHeight = Math.max(1, Math.round((until - from) * canvasScale));
      slice.height = contentHeight + headerHeight;
      const context = slice.getContext('2d');
      if (header) context?.drawImage(canvas, 0, Math.round(header.start * canvasScale), canvas.width, headerHeight, 0, 0, canvas.width, headerHeight);
      context?.drawImage(
        canvas,
        0,
        Math.round(from * canvasScale),
        canvas.width,
        contentHeight,
        0,
        headerHeight,
        canvas.width,
        contentHeight,
      );

      const sliceHeightMm = (slice.height / canvas.width) * contentWidth;
      pdf.addImage(slice.toDataURL('image/png'), 'PNG', PDF_MARGIN_X_MM, PDF_CONTENT_TOP_MM, contentWidth, sliceHeightMm, undefined, 'FAST');
      pdf.setDrawColor(203, 213, 225);
      pdf.line(PDF_MARGIN_X_MM, pageHeight - 13, pageWidth - PDF_MARGIN_X_MM, pageHeight - 13);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.setTextColor(71, 85, 105);
      pdf.text(`Seite ${index + 1} von ${pages.length}`, pageWidth - PDF_MARGIN_X_MM, pageHeight - 8, { align: 'right' });
    });

    return pdf.output('blob');
  } finally {
    iframe.remove();
  }
}

async function renderJournalPdf(data: JournalReportData): Promise<Blob> {
  return renderPdfHtml(buildJournalHTML(data));
}

/** Builds one print/PDF document. Every selected daily close starts on a new page. */
export function buildJournalBatchHTML(reports: JournalReportData[]): string {
  if (reports.length === 1) return buildJournalHTML(reports[0]);
  const first = buildJournalHTML(reports[0]);
  const style = first.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '';
  const bodies = reports.map((report) => {
    const html = buildJournalHTML(report);
    return html.match(/<body>([\s\S]*?)<\/body>/)?.[1] ?? '';
  });
  return `<!doctype html><html><head><meta charset="utf-8"><title>Tagesabschlüsse</title><style>${style}\n.batch-document{break-after:page;page-break-after:always}.batch-document:last-child{break-after:auto;page-break-after:auto}</style></head><body>${bodies.map((body) => `<section class="batch-document">${body}</section>`).join('')}</body></html>`;
}

/** Opens the browser/system save flow. This never uses the automatic journal folder. */
async function savePdfWithUserChoice(data: JournalReportData, blob: Blob): Promise<void> {
  const file = new File([blob], data.fileName, { type: 'application/pdf' });
  const showSaveFilePicker = (window as Window & { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker;

  if (showSaveFilePicker) {
    try {
      const handle = await showSaveFilePicker({
        suggestedName: data.fileName,
        startIn: 'desktop',
        types: [{ description: 'PDF-Datei', accept: { 'application/pdf': ['.pdf'] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (err) {
      if (isAbortError(err)) return;
    }
  }

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: data.fileName });
      return;
    } catch (err) {
      if (isAbortError(err)) return;
    }
  }

  downloadBlob(blob, data.fileName);
}

/**
 * Manual journal export: the person exporting chooses the destination. No
 * location folder is created and no app-managed automatic save is attempted.
 */
export async function exportJournalPdf(data: JournalReportData): Promise<void> {
  const blob = await renderJournalPdf(data);
  await savePdfWithUserChoice(data, blob);
}

export async function exportJournalPdfBatch(reports: JournalReportData[], fileName: string): Promise<void> {
  if (reports.length === 0) return;
  const blob = await renderPdfHtml(buildJournalBatchHTML(reports));
  await savePdfWithUserChoice({ ...reports[0], fileName }, blob);
}

// Browsers intentionally control printer selection and the "Save as PDF"
// destination. The document title supplies the native dialog's file-name
// suggestion without bypassing that browser safety boundary.
export function openJournalPrintDialog(data: JournalReportData): void {
  openPrintHtml(buildJournalHTML(data));
}

export function openJournalPrintBatch(reports: JournalReportData[]): void {
  if (reports.length === 0) return;
  openPrintHtml(buildJournalBatchHTML(reports));
}

function openPrintHtml(html: string): void {
  const printWindow = window.open('', '_blank', 'width=960,height=760');
  if (!printWindow) throw new Error('Der Druckdialog konnte nicht geöffnet werden. Bitte Popups erlauben.');

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();

  let printStarted = false;
  const print = () => {
    if (printStarted || printWindow.closed) return;
    printStarted = true;
    printWindow.focus();
    printWindow.print();
  };
  // document.write()/close() creates a complete local document. One guarded
  // delayed call is enough; an additional load handler opened the dialog twice
  // in some Firefox installations.
  window.setTimeout(print, 250);
}

// The daily-close flow is the sole automatic export. It stores the report in
// the selected year/date/location folder; when a browser cannot provide that
// capability, it falls back to the normal system save flow.
export async function saveJournalPdf(data: JournalReportData): Promise<void> {
  const exportFolder = await chooseExportFolder();
  if (exportFolder === null) return;
  const blob = await renderJournalPdf(data);

  if (exportFolder) {
    try {
      await saveIntoJournalFolder(exportFolder, data, blob);
      return;
    } catch {
      // The stored folder may no longer be available. Preserve the PDF by
      // offering the user's normal browser/system save choice instead.
    }
  }

  await savePdfWithUserChoice(data, blob);
}
