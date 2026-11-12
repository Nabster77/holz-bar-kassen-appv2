/**
 * Device-local document archive naming. No filesystem access here: use this
 * shared, deterministic path for exports and finalized daily-close PDFs.
 */
export interface ArchiveReport {
  location: string;
  fileName: string;
  documentTitle?: string;
  /** Start of the report period, NOT the date the export is clicked. */
  reportPeriodStart?: number;
}

export function archiveSubfolders(report: ArchiveReport): string[] {
  const date = new Date(report.reportPeriodStart ?? Date.now());
  if (!Number.isFinite(date.getTime())) throw new Error('Ungültiger Berichtszeitraum.');
  const year = String(date.getFullYear());
  const scope = report.location.trim().toLocaleLowerCase('de-DE');
  const location = scope.includes('alle') || scope.includes('beide')
    ? 'Alle-Standorte'
    : scope.includes('bregenz') ? 'Bregenz' : 'Friedrichshafen';
  const name = (report.documentTitle ?? '') + ' ' + report.fileName;
  const kind = /Tagesabschluss/i.test(name) ? 'Tagesabschluss'
    : /Wochenjournal/i.test(name) ? 'Wochenjournal'
    : /Monatsjournal/i.test(name) ? 'Monatsjournal'
    : /Jahresjournal/i.test(name) ? 'Jahresjournal'
    : /Tagesjournal/i.test(name) ? 'Tagesjournal'
    : /Einzel(?:beleg|bon)/i.test(name) ? 'Einzelbelege'
    : /Kassen(?:uebersicht|übersicht)/i.test(name) ? 'Kassenuebersicht'
    : /Storno/i.test(name) ? 'Storno'
    : 'Weitere-Berichte';
  return [year, location, kind];
}

export function safeArchiveFileName(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|\x00-\x1F]/g, '_').trim();
  if (!cleaned || cleaned === '.' || cleaned === '..') throw new Error('Ungültiger Dateiname.');
  return cleaned.endsWith('.pdf') ? cleaned : cleaned + '.pdf';
}
