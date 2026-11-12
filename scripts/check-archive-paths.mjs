import assert from 'node:assert/strict';
import { archiveSubfolders, safeArchiveFileName } from '../src/lib/archivePaths.ts';

const priorYear = new Date(2025, 11, 31, 10).getTime();
const currentYear = new Date(2026, 10, 12, 9).getTime();

assert.deepEqual(archiveSubfolders({
  fileName: 'Friedrichshafen_Tagesjournal_31-12-2025.pdf',
  location: 'Friedrichshafen',
  reportPeriodStart: priorYear,
}), ['2025', 'Friedrichshafen', 'Tagesjournal']);
assert.deepEqual(archiveSubfolders({
  fileName: 'Bregenz_Tagesabschluss_2026-11-12_TA-BR-2026-000001.pdf',
  location: 'Bregenz',
  documentTitle: 'Tagesabschluss',
  reportPeriodStart: currentYear,
}), ['2026', 'Bregenz', 'Tagesabschluss']);
assert.deepEqual(archiveSubfolders({
  fileName: 'Alle-Standorte_Wochenjournal_KW46.pdf',
  location: 'Alle Standorte',
  reportPeriodStart: currentYear,
}), ['2026', 'Alle-Standorte', 'Wochenjournal']);
assert.throws(() => archiveSubfolders({
  fileName: 'Journal.pdf',
  location: 'unbekannter Ort',
  reportPeriodStart: currentYear,
}), /Unbekannter Standort/);
assert.equal(safeArchiveFileName('Friedrichshafen_12:30/Beleg?'), 'Friedrichshafen_12_30_Beleg_.pdf');
assert.throws(() => safeArchiveFileName(''), /Ungültiger Dateiname/);
console.log('PDF-Archivpfade bestanden: Zeitbezug, Standorte, Berichtsarten, Dateinamen.');
