import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PdfArchiveSetupRequired, requirePdfArchiveSetup, PDF_ARCHIVE_SETUP_EVENT }
  from '../src/lib/pdfArchiveSetup.ts';

const messages=[];
globalThis.CustomEvent=class {
  constructor(type,options){this.type=type;this.detail=options?.detail;}
};
globalThis.window={dispatchEvent(event){messages.push(event);return true;}};
assert.throws(()=>requirePdfArchiveSetup('Ordner fehlt'),PdfArchiveSetupRequired);
assert.equal(messages.length,1);
assert.equal(messages[0].type,PDF_ARCHIVE_SETUP_EVENT);
assert.equal(messages[0].detail.message,'Ordner fehlt');

const pdf=readFileSync('src/lib/journalPdfFile.ts','utf8');
const app=readFileSync('src/App.tsx','utf8');
assert.match(pdf,/requirePdfArchiveSetup/);
assert.match(pdf,/localArchiveFolder/);
assert.match(pdf,/saveIntoJournalFolder/);
assert.doesNotMatch(pdf,/supabase\.storage|storage\.from|supabase\.from/);
assert.match(app,/PDF_ARCHIVE_SETUP_EVENT/);
assert.match(app,/setDeviceSetupOpen\(true\)/);
assert.match(app,/persistFinalizedCashSession\(closed\)/);
assert.match(app,/store\.commitFinalizedSession\(closed\)/);
assert.ok(app.indexOf('await persistFinalizedCashSession(closed)') <
  app.indexOf('store.commitFinalizedSession(closed)'), 'Cloud acknowledgement precedes local close');
console.log('PDF-LOKAL-REGEL: Setup-Warnung, keine PDF-Cloudspeicherung, bestätigter Abschlussablauf geprüft.');
