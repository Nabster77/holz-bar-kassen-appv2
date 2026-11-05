import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { buildJournalHTML, type JournalReportData } from '@/lib/journalPdf';
import { getWeekNumber } from '@/lib/format';
import type { Location } from '@/types';

const RENDER_WIDTH_PX = 900;
const MONTHS_SHORT = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const ALL_LABEL = 'Alle-Standorte';

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

async function renderJournalPdf(html: string): Promise<Blob> {
  const iframe = document.createElement('iframe');
  iframe.style.cssText = `position:fixed;left:-10000px;top:0;width:${RENDER_WIDTH_PX}px;height:1200px;border:0`;
  iframe.srcdoc = html;
  document.body.appendChild(iframe);

  try {
    await new Promise<void>((resolve) => { iframe.onload = () => resolve(); });
    const body = iframe.contentDocument?.body;
    if (!body) throw new Error('Journal konnte nicht gerendert werden.');

    const canvas = await html2canvas(body, {
      scale: 2,
      width: RENDER_WIDTH_PX,
      windowWidth: RENDER_WIDTH_PX,
      backgroundColor: '#ffffff',
    });

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const sourcePageHeight = (canvas.width * pageHeight) / pageWidth;

    let offsetY = 0;
    let isFirstPage = true;
    while (offsetY < canvas.height) {
      const sliceHeight = Math.min(sourcePageHeight, canvas.height - offsetY);
      const slice = document.createElement('canvas');
      slice.width = canvas.width;
      slice.height = sliceHeight;
      slice.getContext('2d')?.drawImage(canvas, 0, offsetY, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);

      if (!isFirstPage) pdf.addPage();
      isFirstPage = false;
      pdf.addImage(slice.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, pageWidth, (sliceHeight * pageWidth) / canvas.width);
      offsetY += sliceHeight;
    }

    return pdf.output('blob');
  } finally {
    iframe.remove();
  }
}

type SaveFilePicker = (options: {
  suggestedName: string;
  startIn: 'desktop';
  types: { description: string; accept: Record<string, string[]> }[];
}) => Promise<FileSystemFileHandle>;

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

export async function saveJournalPdf(data: JournalReportData): Promise<void> {
  const blob = await renderJournalPdf(buildJournalHTML(data));
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
