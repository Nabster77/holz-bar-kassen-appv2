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

const MONTH_NAMES = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

export function archiveSubfolders(report: ArchiveReport): string[] {
  const date = new Date(report.reportPeriodStart ?? Date.now());
  if (!Number.isFinite(date.getTime())) throw new Error('Ungültiger Berichtszeitraum.');
  // Both cash locations use Central European civil dates, including DST.
  const month = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', month: 'numeric' }).format(date));
  if (month < 1 || month > 12) throw new Error('Ungültiger Berichtsmonat.');
  const scope = report.location.trim().toLocaleLowerCase('de-DE');
  const location = scope.includes('alle') || scope.includes('beide')
    ? 'Alle-Standorte'
    : scope.includes('bregenz') ? 'Bregenz'
      : scope.includes('friedrichshafen') ? 'Friedrichshafen' : null;
  if (!location) throw new Error('Unbekannter Standort im PDF-Bericht.');
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
  return [location, MONTH_NAMES[month - 1], kind];
}

export function safeArchiveFileName(name: string): string {
  const cleaned = Array.from(name, char => char.charCodeAt(0) < 32 ? '_' : char)
    .join('').replace(/[\\/:*?"<>|]/g, '_').trim();
  if (!cleaned || cleaned === '.' || cleaned === '..') throw new Error('Ungültiger Dateiname.');
  return cleaned.endsWith('.pdf') ? cleaned : cleaned + '.pdf';
}


/** Determine the archive location for a batch rather than using the first receipt. */
export function batchArchiveLocation(locations: readonly string[], fileName: string): string {
  if (locations.length === 0) throw new Error('Leerer PDF-Sammelbericht.');
  if (/Alle[- ]Standorte/i.test(fileName) ||
      new Set(locations.map((location) => location.trim().toLocaleLowerCase('de-DE'))).size > 1) {
    return 'Alle Standorte';
  }
  return locations[0];
}
