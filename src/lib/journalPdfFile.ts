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

/**
 * Determines page breaks at real content boundaries before any bitmap is
 * sliced. This avoids cutting headings or table rows through the middle.
 */
function getSafeBreaks(doc: Document, maxPageHeightPx: number): number[] {
  const body = doc.body;
  const bodyRect = body.getBoundingClientRect();
  const totalHeight = Math.ceil(Math.max(body.scrollHeight, bodyRect.height));
  const candidates = [...doc.querySelectorAll<HTMLElement>('.loc-header, .summary-grid, .tax-section, h2, tr, .empty')]
    .map((el) => Math.round(el.getBoundingClientRect().top - bodyRect.top))
    .filter((top) => top > 0 && top < totalHeight)
    .sort((a, b) => a - b);

  const breaks: number[] = [];
  let from = 0;
  while (from < totalHeight) {
    const target = Math.min(from + maxPageHeightPx, totalHeight);
    if (target === totalHeight) {
      breaks.push(totalHeight);
      break;
    }

    // Do not create nearly empty pages. A content boundary is useful only if
    // the current page already contains a meaningful amount of content.
    const minimum = from + Math.min(220, maxPageHeightPx * 0.35);
    const safe = candidates.filter((point) => point >= minimum && point <= target).pop();
    const next = safe ?? target;
    breaks.push(next);
    from = next;
  }
  return breaks;
}

async function renderJournalPdf(data: JournalReportData): Promise<Blob> {
  const iframe = document.createElement('iframe');
  iframe.style.cssText = `position:fixed;left:-10000px;top:0;width:${RENDER_WIDTH_PX}px;height:1200px;border:0;background:#fff`;
  iframe.srcdoc = buildJournalHTML(data);
  document.body.appendChild(iframe);

  try {
    await waitForLoad(iframe);
    const doc = iframe.contentDocument;
    const body = doc?.body;
    if (!doc || !body) throw new Error('Das Journal konnte nicht gerendert werden.');

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const contentWidth = pageWidth - PDF_MARGIN_X_MM * 2;
    const contentHeight = pageHeight - PDF_CONTENT_TOP_MM - PDF_CONTENT_BOTTOM_MM;
    const maxPageHeightPx = Math.floor(contentHeight / (contentWidth / RENDER_WIDTH_PX));
    const breaks = getSafeBreaks(doc, maxPageHeightPx);

    const canvas = await html2canvas(body, {
      scale: 2,
      width: RENDER_WIDTH_PX,
      windowWidth: RENDER_WIDTH_PX,
      windowHeight: Math.max(body.scrollHeight, 1200),
      backgroundColor: '#ffffff',
      useCORS: true,
    });
    const canvasScale = canvas.width / RENDER_WIDTH_PX;
    let from = 0;

    breaks.forEach((until, index) => {
      if (index > 0) pdf.addPage();
      const slice = document.createElement('canvas');
      slice.width = canvas.width;
      slice.height = Math.max(1, Math.round((until - from) * canvasScale));
      const context = slice.getContext('2d');
      context?.drawImage(
        canvas,
        0,
        Math.round(from * canvasScale),
        canvas.width,
        slice.height,
        0,
        0,
        canvas.width,
        slice.height,
      );

      const sliceHeightMm = (slice.height / canvas.width) * contentWidth;
      pdf.addImage(slice.toDataURL('image/png'), 'PNG', PDF_MARGIN_X_MM, PDF_CONTENT_TOP_MM, contentWidth, sliceHeightMm, undefined, 'FAST');
      pdf.setDrawColor(203, 213, 225);
      pdf.line(PDF_MARGIN_X_MM, pageHeight - 13, pageWidth - PDF_MARGIN_X_MM, pageHeight - 13);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.setTextColor(71, 85, 105);
      pdf.text(`Seite ${index + 1} von ${breaks.length}`, pageWidth - PDF_MARGIN_X_MM, pageHeight - 8, { align: 'right' });
      from = until;
    });

    return pdf.output('blob');
  } finally {
    iframe.remove();
  }
}

/** Creates a real PDF download with permanent page numbers. */
export async function exportJournalPdf(data: JournalReportData): Promise<void> {
  // This is intentionally requested before rendering. Directory pickers need
  // to be called directly from the user's PDF-Export click.
  const exportFolder = await chooseExportFolder();
  if (exportFolder === null) return;
  const blob = await renderJournalPdf(data);

  if (exportFolder) {
    try {
      await saveIntoJournalFolder(exportFolder, data, blob);
      return;
    } catch {
      // Permission may have expired; continue with the ordinary browser save
      // dialog rather than losing the generated PDF.
    }
  }

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

// Browsers intentionally control printer selection and the "Save as PDF"
// destination. The document title supplies the native dialog's file-name
// suggestion without bypassing that browser safety boundary.
export function openJournalPrintDialog(data: JournalReportData): void {
  const printWindow = window.open('', '_blank', 'width=960,height=760');
  if (!printWindow) throw new Error('Der Druckdialog konnte nicht geöffnet werden. Bitte Popups erlauben.');

  printWindow.document.open();
  printWindow.document.write(buildJournalHTML(data));
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

// The daily-close flow should produce the same properly paginated PDF.
export async function saveJournalPdf(data: JournalReportData): Promise<void> {
  await exportJournalPdf(data);
}
