import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildImportPlan, exportWorkbook, readWorkbook, readImageZip, normalizeName } from '../src/lib/catalogTransfer';
import { seedCategories, seedProducts } from '../src/lib/seed';
import { DEFAULT_SHOTS, normalizeCategories } from '../src/lib/shotCatalog';
import { taxRateForProduct } from '../src/lib/tax';
import type { LocalCatalog } from '../src/lib/catalogSync';
import { unzipSync, zipSync } from 'fflate';
import { buildCatalogBundle } from '../src/lib/catalogBundleExport';
const base: LocalCatalog = {categories:normalizeCategories(seedCategories),products:structuredClone(seedProducts),shotOptions:structuredClone(DEFAULT_SHOTS),pfandSettings:{Friedrichshafen:.25,Bregenz:.2}};
const headers = ['Produktname App','VK 2026','Warengruppe','Preis durch Mitarbeiter oder fix','Steuer DE in %','Steuer AT in %'];
const product = ['Neu',4,'Neue Gruppe','fix',19,20];
const make = (rows: unknown[][]) => ({Tabelle1:[headers,...rows]});
const original = JSON.stringify(base);
const plan = buildImportPlan(make([product,['Rum (Schuss)',2,'SCHUSS','fix',19,20],['Einzelpreis',null,'Handwerk','individuell eintragen',7,10]]),base);
assert.deepEqual(plan.errors,[]);
assert.equal(plan.next.products.length,base.products.length+2);
assert.equal(plan.next.shotOptions.find(s=>s.id==='rum')?.price,2);
assert.equal(plan.next.shotOptions.find(s=>s.id==='rum')?.name,'Rum');
assert(!plan.next.products.some(p=>p.categoryId==='cat-system-schuss'));
assert.equal(plan.next.products.find(p=>p.name==='Einzelpreis')?.hasIndividualPrice,true);
assert.equal(JSON.stringify(base),original,'preview cannot mutate local data');
assert(buildImportPlan(make([product,product]),base).errors.some(e=>e.includes('Doppelter Name')));
for (const bad of [-1,'1,234',NaN,Infinity,'abc']) assert(buildImportPlan(make([['Bad',bad,'G','fix',19,20]]),base).errors.length);
assert(buildImportPlan(make([['Bad',4,'G','fix',20,19]]),base).errors.length);
assert(buildImportPlan(make([['Bad',4,'G','maybe',19,20]]),base).errors.length);
const at13 = buildImportPlan(make([['AT',4,'G','fix',7,13]]),base);
assert.deepEqual(at13.errors,[]); assert.equal(taxRateForProduct(at13.next.products.at(-1)!,'Bregenz'),13);
const ambiguous = structuredClone(base); ambiguous.products.push({...ambiguous.products[0],id:'duplicate'});
assert(buildImportPlan(make([['Cola 0,5l',4,'Getränke','fix',19,20]]),ambiguous).errors.length);
// Use a genuine 1x1 PNG. Fake JPG bytes must be rejected by the importer.
const validPng = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP48OEDAAWkAtFabOJuAAAAAElFTkSuQmCC','base64'));
const images = readImageZip(zipSync({'outer/nested/Neu(2).png':validPng,'ignored.txt':new Uint8Array([1])}));
assert.equal(images.length,1); assert.equal(normalizeName('Ätherische Öle(2)'),normalizeName('Ätherische Öle'));
const withImage = buildImportPlan(make([product]),base,images);
assert.equal(Object.keys(withImage.images).length,1);
const duplicates = [...images,{...images[0],path:'other/neu.jpg'}];
const ambiguousImages = buildImportPlan(make([product]),base,duplicates);
assert.deepEqual(ambiguousImages.errors,[], 'Artikelimport darf bei doppeltem Bild nicht abbrechen');
assert(ambiguousImages.warnings.some(w=>w.includes('mehrere gleichwertige ZIP-Bilder')));
assert.equal(Object.keys(ambiguousImages.images).length,0,'mehrdeutige Bilder duerfen nicht stillschweigend hochgeladen werden');
const missing = buildImportPlan(make([['Other',1,'G','fix',19,20]]),base,images);
assert.equal(missing.errors.length,0); assert(missing.warnings.some(w=>w.includes('kein exaktes ZIP-Bild')));
const existing = [{...images[0],path:'outer/Cola 0,5l.jpg'}];
assert.equal(Object.keys(buildImportPlan(make([['Cola 0,5l',4,'Getränke','fix',19,20]]),base,existing).images).length,0);
assert.equal(Object.keys(buildImportPlan(make([['Cola 0,5l',4,'Getränke','fix',19,20]]),base,existing,true).images).length,1);
const {default: ExcelJS} = await import('exceljs');
const formulas = new ExcelJS.Workbook(); const formulaSheet=formulas.addWorksheet('Formel');
formulaSheet.getCell('A1').value={formula:'1+1',result:2};
await assert.rejects(readWorkbook(await formulas.xlsx.writeBuffer() as ArrayBuffer),/Formeln/);
const workbook = await exportWorkbook(base);
const roundtrip = buildImportPlan(await readWorkbook(workbook),base);
assert.deepEqual(roundtrip.errors,[]);
assert.deepEqual(roundtrip.next,base,'export/import must preserve all catalog data including optional defaults');
assert(roundtrip.rows.every(r=>r.status==='unverändert'));
const modified = structuredClone(base);
modified.products[0].taxRates = {Friedrichshafen:7,Bregenz:13};
modified.shotOptions[0].locationPrices = {Bregenz:2.75};
const twice = buildImportPlan(await readWorkbook(await exportWorkbook(modified)),modified);
assert.deepEqual(twice.next,modified,'explicit rates and shot overrides roundtrip');
if (process.argv[2]) {
 const bytes = fs.readFileSync(process.argv[2]);
 const archive = process.argv[3] ? readImageZip(fs.readFileSync(process.argv[3])) : [];
 const actual = buildImportPlan(await readWorkbook(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)),base,archive);
 assert.deepEqual(actual.errors,[]);
 assert.equal(actual.next.products.length-base.products.length,51);
 assert.equal(actual.next.shotOptions.length,4);
 assert.equal(actual.next.pfandSettings.Bregenz,3);
 console.log(`Originaldateien: ${actual.next.products.length-base.products.length} Artikel, ${actual.rows.filter(r=>r.kind==='SCHUSS'&&r.status==='geändert').length} SCHUSS-Änderungen, ${Object.keys(actual.images).length} Bildzuordnungen, ${actual.warnings.length} Bildhinweise.`);
}
console.log('Katalogtests erfolgreich: Vorschau, Duplikate, Preis-/Steuervalidierung, SCHUSS-Schutz, ZIP-Unterordner, Bildschutz und vollständiger Excel-Roundtrip.');

// V3 reverse workflow: Excel + correctly named image ZIP in one export package.
const imageProduct = {...base.products[0], imageUrl:'https://example.invalid/woodmo-roundtrip.png'};
const roundtripCatalog: LocalCatalog = {...base, products:[imageProduct, {...base.products[1], imageUrl:''}]};
const realFetch = globalThis.fetch;
try {
  globalThis.fetch = (async (url: string | URL | Request) => {
    assert.equal(String(url), imageProduct.imageUrl);
    return new Response(validPng, {status:200, headers:{'content-type':'image/png'}});
  }) as typeof fetch;
  const packageResult = await buildCatalogBundle(roundtripCatalog);
  assert.equal(packageResult.exportedImages, 1);
  assert.equal(packageResult.missingImages.length, 1);
  const files = unzipSync(packageResult.bytes);
  assert(files['WOODMO_Katalog.xlsx']);
  assert(files['WOODMO_Bilder.zip']);
  const inside = readImageZip(files['WOODMO_Bilder.zip']);
  assert.equal(inside.length,1);
  assert(inside[0].path.includes(imageProduct.name + '.png'));
  const excelBytes = files['WOODMO_Katalog.xlsx'];
  const imported = buildImportPlan(
    await readWorkbook(excelBytes.buffer.slice(excelBytes.byteOffset,excelBytes.byteOffset+excelBytes.byteLength) as ArrayBuffer),
    roundtripCatalog,inside,true);
  assert.deepEqual(imported.errors,[]);
  assert(imported.images[imageProduct.id]);
  // A missing remote image must not create a seemingly complete backup.
  globalThis.fetch = (async () => new Response('Not Found',{status:404})) as typeof fetch;
  await assert.rejects(buildCatalogBundle(roundtripCatalog),/nicht exportiert werden/);
  console.log('V3-EXCEL+BILDER-RÜCKIMPORT: Paket, Dateiname, ZIP, Vorschau und Fehlerfall bestanden.');
} finally {
  globalThis.fetch = realFetch;
}
