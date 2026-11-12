import assert from 'node:assert/strict';
import { archiveSubfolders, batchArchiveLocation, safeArchiveFileName } from '../src/lib/archivePaths.ts';

const priorYear = new Date(2025, 11, 31, 10).getTime();
const currentYear = new Date(2026, 10, 12, 9).getTime();

assert.deepEqual(archiveSubfolders({
  fileName: 'Friedrichshafen_Tagesjournal_31-12-2025.pdf',
  location: 'Friedrichshafen',
  reportPeriodStart: priorYear,
}), ['Friedrichshafen', 'Dezember', 'Tagesjournal']);
assert.deepEqual(archiveSubfolders({
  fileName: 'Bregenz_Tagesabschluss_2026-11-12_TA-BR-2026-000001.pdf',
  location: 'Bregenz',
  documentTitle: 'Tagesabschluss',
  reportPeriodStart: currentYear,
}), ['Bregenz', 'November', 'Tagesabschluss']);
assert.deepEqual(archiveSubfolders({
  fileName: 'Alle-Standorte_Wochenjournal_KW46.pdf',
  location: 'Alle Standorte',
  reportPeriodStart: currentYear,
}), ['Alle-Standorte', 'November', 'Wochenjournal']);
assert.throws(() => archiveSubfolders({
  fileName: 'Journal.pdf',
  location: 'unbekannter Ort',
  reportPeriodStart: currentYear,
}), /Unbekannter Standort/);
assert.equal(safeArchiveFileName('Friedrichshafen_12:30/Beleg?'), 'Friedrichshafen_12_30_Beleg_.pdf');
assert.throws(() => safeArchiveFileName(''), /Ungültiger Dateiname/);

assert.equal(batchArchiveLocation(['Friedrichshafen', 'Bregenz'], 'Tagesabschluesse_2026.pdf'), 'Alle Standorte');
assert.equal(batchArchiveLocation(['Friedrichshafen'], 'Tagesabschluesse_Alle-Standorte_2026.pdf'), 'Alle Standorte');
assert.equal(batchArchiveLocation(['Bregenz'], 'Tagesabschluesse_Bregenz_2026.pdf'), 'Bregenz');
assert.throws(() => batchArchiveLocation([], 'Tagesabschluesse.pdf'), /Leerer PDF-Sammelbericht/);

assert.deepEqual(archiveSubfolders({
  fileName:'Bregenz_Tagesabschluss_2027-01-01.pdf',
  location:'Bregenz',
  reportPeriodStart:Date.parse('2026-12-31T23:30:00Z'),
}), ['Bregenz','Januar','Tagesabschluss'], 'Berlin/Bregenz bereits im neuen Jahr');
assert.deepEqual(archiveSubfolders({
  fileName:'Bregenz_Tagesjournal_2026-12-31.pdf',
  location:'Bregenz',
  reportPeriodStart:Date.parse('2026-12-31T22:30:00Z'),
}), ['Bregenz','Dezember','Tagesjournal'], 'Historischer Dezember bleibt im alten Jahr');
console.log('PDF-Archivpfade bestanden: Zeitbezug, Standorte, Berichtsarten, Monats- und Jahreswechsel.');
