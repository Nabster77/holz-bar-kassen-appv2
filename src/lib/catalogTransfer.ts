import { Unzip, UnzipInflate } from 'fflate';
import type { Category, Product, ShotOption, Location, TaxClass } from '@/types';
import { stableStringify, type LocalCatalog } from './catalogSync';
import { normalizeCategories, SHOT_CATEGORY_ID, validShots } from './shotCatalog';
import { taxRateForProduct, taxRateForClass } from './tax';

export const locations = ['Friedrichshafen', 'Bregenz'] as const;
export type SheetRows = Record<string, unknown[][]>;
export type PreviewRow = { id?: string; kind: string; name: string; status: 'neu' | 'geändert' | 'unverändert'; changes: string[]; image?: string };
export type ImageEntry = { path: string; bytes: Uint8Array; mime: string };
export type ImportPlan = { base: LocalCatalog; next: LocalCatalog; rows: PreviewRow[]; errors: string[]; warnings: string[]; images: Record<string, ImageEntry> };
export const normalizeName = (v: unknown): string => String(v ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/ß/g, 'ss').toLocaleLowerCase('de-DE').replace(/\(\d+\)\s*$/, '').replace(/[^a-z0-9]/g, '');
const text = (v: unknown) => String(v ?? '').trim();
const empty = (v: unknown) => v === undefined || v === null || v === '';
const id = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
function number(v: unknown, label: string, fallback?: number): number {
  if (empty(v) && fallback !== undefined) return fallback;
  const raw = typeof v === 'number' ? v : /^\d+(?:[.,]\d{1,2})?$/.test(text(v)) ? Number(text(v).replace(',', '.')) : NaN;
  if (!Number.isFinite(raw) || raw < 0 || raw > 99999 || Math.abs(raw * 100 - Math.round(raw * 100)) > 1e-6) throw new Error(`${label}: ungültiger Wert „${text(v)}“.`);
  return raw;
}
function bool(v: unknown, fallback: boolean): boolean {
  if (empty(v)) return fallback;
  if ([true, 1, 'ja', 'true'].includes(typeof v === 'string' ? v.toLowerCase() : v as boolean)) return true;
  if ([false, 0, 'nein', 'false'].includes(typeof v === 'string' ? v.toLowerCase() : v as boolean)) return false;
  throw new Error(`Ungültiger Ja/Nein-Wert „${text(v)}“.`);
}
function tax(v: unknown, location: Location, fallback?: number): number {
  const n = number(v, `Steuer ${location}`, fallback);
  if (!(location === 'Friedrichshafen' ? [0, 7, 19] : [0, 10, 13, 20]).includes(n)) throw new Error(`Nicht unterstützter Steuersatz ${n}% für ${location}.`);
  return n;
}
function match<T extends {id: string; name: string}>(items: T[], rawId: unknown, name: string, key = normalizeName): T | undefined {
  if (!empty(rawId)) {
    const byId = items.find(x => x.id === text(rawId));
    if (!byId) throw new Error(`Unbekannte ID „${text(rawId)}“. Für neue Einträge ID leer lassen.`);
    return byId;
  }
  const matches = items.filter(x => key(x.name) === key(name));
  if (matches.length > 1) throw new Error(`Name „${name}“ ist mehrdeutig. Bitte ID aus dem Export verwenden.`);
  return matches[0];
}
const shotKey = (v: unknown) => normalizeName(text(v).replace(/\(schuss\)/ig, '').replace(/[()]/g, ''));
function table(rows: unknown[][], required: string): { index: number; records: Record<string, unknown>[] } | null {
  const index = rows.findIndex(r => r.some(c => text(c) === required));
  if (index < 0) return null;
  const headers = rows[index].map(text);
  if (new Set(headers.filter(Boolean)).size !== headers.filter(Boolean).length) throw new Error('Doppelte Spaltenüberschrift.');
  return { index, records: rows.slice(index + 1).filter(r => r.some(c => !empty(c))).map(r => Object.fromEntries(headers.map((h, i) => [h, r[i]]))) };
}
export function buildImportPlan(sheets: SheetRows, base: LocalCatalog, archive: ImageEntry[] = [], replaceImages = false): ImportPlan {
  const next: LocalCatalog = structuredClone(base);
  const plan: ImportPlan = { base: structuredClone(base), next, rows: [], errors: [], warnings: [], images: {} };
  const seen = new Set<string>();
  const names = new Set<string>();
  const uniqueName = (key: string) => { if (names.has(key)) throw new Error('Doppelter Name innerhalb derselben Warengruppe.'); names.add(key); };
  function record(kind: string, value: {id: string; name?: string}, before: unknown, image?: string) {
    const key = `${kind}:${value.id}`;
    if (seen.has(key)) throw new Error(`Doppelter Eintrag „${value.name ?? value.id}“.`);
    seen.add(key);
    const old = before as Record<string, unknown> | undefined;
    const changes = Object.entries(value).filter(([k, v]) => stableStringify(v) !== stableStringify(old?.[k])).map(([k, v]) => `${k}: ${stableStringify(old?.[k]) ?? '—'} → ${stableStringify(v)}`);
    plan.rows.push({id: value.id, kind, name: value.name ?? value.id, status: !before ? 'neu' : changes.length || image ? 'geändert' : 'unverändert', changes, image});
  }
  const upsert = <T extends {id: string}>(items: T[], value: T) => { const i = items.findIndex(x => x.id === value.id); if (i < 0) items.push(value); else items[i] = value; };
  const protect = (context: string, action: () => void) => { try { action(); } catch (e) { plan.errors.push(`${context}: ${(e as Error).message}`); } };
  // Exported category metadata is imported before products, including empty groups.
  if (sheets.Warengruppen) protect('Warengruppen', () => {
    const t = table(sheets.Warengruppen, 'Warengruppe');
    if (!t) throw new Error('Kopfzeile fehlt.');
    t.records.forEach((r, i) => protect(`Warengruppe Zeile ${i + 2}`, () => {
      const name = text(r.Warengruppe); if (!name) throw new Error('Name fehlt.');
      if (normalizeName(name) === 'schuss') { if (!empty(r.ID) && text(r.ID) !== SHOT_CATEGORY_ID) throw new Error('SCHUSS ist eine geschützte Systemgruppe.'); return; }
      if (text(r.ID) === SHOT_CATEGORY_ID) throw new Error('Die SCHUSS-Systemgruppe darf nicht umbenannt werden.');
      uniqueName(`category:${normalizeName(name)}`);
      const old = match(base.categories, r.ID, name);
      const c: Category = { id: old?.id ?? id('cat'), name, icon: text(r.Icon) || old?.icon || 'Package', color: text(r.Farbe) || old?.color || 'from-cyan-500 to-blue-600', sortOrder: number(r.Sortierung, 'Sortierung', old?.sortOrder ?? next.categories.length) };
      record('Warengruppe', c, old); upsert(next.categories, c);
    }));
  });
  let found = false;
  for (const [sheet, rows] of Object.entries(sheets)) {
    if (sheet === 'Warengruppen' || sheet === 'Einstellungen') continue;
    protect(sheet, () => {
      const t = table(rows, 'Produktname App'); if (!t) return; found = true;
      // Original 2026 layout: the two global deposits precede the header.
      for (const loc of locations) {
        const settings = rows.slice(0, t.index).filter(r => text(r[0]) === loc);
        if (settings.length > 1) throw new Error(`Pfand ${loc} mehrfach angegeben.`);
        if (settings.length) next.pfandSettings[loc] = number(settings[0][1], `Pfand ${loc}`);
      }
      t.records.forEach((r, i) => protect(`${sheet}, Datenzeile ${i + 1}`, () => {
        const name = text(r['Produktname App']); const group = text(r.Warengruppe);
        if (!name || !group) throw new Error('Artikelname oder Warengruppe fehlt.');
        const isShot = normalizeName(group) === 'schuss';
        const priceKind = text(r['Preis durch Mitarbeiter oder fix']);
        if (!['fix', 'individuell eintragen'].includes(priceKind)) throw new Error('Preisart muss „fix“ oder „individuell eintragen“ sein.');
        if (isShot && priceKind !== 'fix') throw new Error('SCHUSS benötigt einen festen Preis.');
        const oldShot = isShot ? match(base.shotOptions, r.ID, name, shotKey) : undefined;
        let category = next.categories.find(c => normalizeName(c.name) === normalizeName(group));
        if (!isShot && next.categories.filter(c => normalizeName(c.name) === normalizeName(group)).length > 1) throw new Error(`Warengruppe „${group}“ mehrdeutig.`);
        if (!category && !isShot) {
          category = { id: id('cat'), name: group, icon: 'Package', color: 'from-cyan-500 to-blue-600', sortOrder: next.categories.length };
          next.categories.push(category); record('Warengruppe', category, undefined);
        }
        uniqueName(isShot ? `shot:${shotKey(name)}` : `product:${category!.id}:${normalizeName(name)}`);
        const candidates = base.products.filter(p => p.categoryId === category?.id);
        const old = !isShot ? match(empty(r.ID) ? candidates : base.products, r.ID, name) : undefined;
        if (old?.categoryId === SHOT_CATEGORY_ID) throw new Error('Normaler Artikel darf nicht in SCHUSS umgewandelt werden.');
        const individual = priceKind === 'individuell eintragen';
        const shared = number(r['VK 2026'], 'Grundpreis', individual ? old?.prices.Friedrichshafen ?? 0 : oldShot?.price);
        const prices = { Friedrichshafen: number(r['VK DE'], 'VK DE', shared), Bregenz: number(r['VK AT'], 'VK AT', shared) };
        const rates = { Friedrichshafen: tax(r['Steuer DE in %'], 'Friedrichshafen', old ? taxRateForProduct(old, 'Friedrichshafen') : undefined), Bregenz: tax(r['Steuer AT in %'], 'Bregenz', old ? taxRateForProduct(old, 'Bregenz') : undefined) };
        if (isShot) {
          if (rates.Friedrichshafen !== 19 || rates.Bregenz !== 20) throw new Error('SCHUSS wird über den Basisartikel versteuert; erwartet werden 19% DE / 20% AT.');
          const value: ShotOption = { ...oldShot, id: oldShot?.id ?? id('shot'), name: oldShot && empty(r.ID) ? oldShot.name : name, price: shared };
          const overrides: Partial<Record<Location, number>> = {};
          for (const loc of locations) if (!empty(r[loc === 'Friedrichshafen' ? 'VK DE' : 'VK AT'])) overrides[loc] = prices[loc];
          if (Object.keys(overrides).length) value.locationPrices = overrides; else delete value.locationPrices;
          record('SCHUSS', value, oldShot); upsert(next.shotOptions, value); return;
        }
        const inferredClass: TaxClass = rates.Friedrichshafen === 0 ? 'zero' : rates.Friedrichshafen === 7 ? 'reduced' : 'standard';
        const cls = (text(r.Steuerklasse) || inferredClass) as TaxClass;
        if (!['standard','reduced','zero'].includes(cls)) throw new Error('Ungültige Steuerklasse.');
        const p: Product = { ...old, id: old?.id ?? id('p'), name, categoryId: category!.id, imageUrl: old?.imageUrl ?? '', taxClass: cls,
          prices, taxRates: rates, available: bool(r.Verfügbar, old?.available ?? true), sortOrder: number(r.Sortierung, 'Sortierung', old?.sortOrder ?? next.products.length),
          hasShot: bool(r['Schuss erlaubt'], old?.hasShot ?? false), hasIndividualPrice: individual,
          isPfandArticle: bool(r.Pfandartikel, old?.isPfandArticle ?? false), pfand: { Friedrichshafen: number(r['Pfand DE'], 'Pfand DE', old?.pfand.Friedrichshafen ?? 0), Bregenz: number(r['Pfand AT'], 'Pfand AT', old?.pfand.Bregenz ?? 0) } };
        if (!empty(r.Schusspreise)) {
          const parsed: unknown = JSON.parse(text(r.Schusspreise));
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Schusspreise müssen ein JSON-Objekt sein.');
          p.shotPrices = Object.fromEntries(Object.entries(parsed).map(([k,v]) => [k, number(v, 'Schusspreis')]));
        }
        // Avoid rewriting legacy records merely to make implicit defaults explicit.
        if (!old?.taxRates && locations.every(loc => rates[loc] === taxRateForClass(cls, loc))) delete p.taxRates;
        if (old?.hasIndividualPrice === undefined && !p.hasIndividualPrice) delete p.hasIndividualPrice;
        if (old?.isPfandArticle === undefined && !p.isPfandArticle) delete p.isPfandArticle;
        if (old?.shotPrices === undefined && p.shotPrices && !Object.keys(p.shotPrices).length) delete p.shotPrices;
        const imageUrl = text(r.Bild);
        if (imageUrl && imageUrl !== p.imageUrl) {
          if (!/^(https?:\/\/|\/[^/])/.test(imageUrl)) throw new Error('Bild muss eine HTTP(S)-URL oder ein lokaler Asset-Pfad sein.');
          if (!p.imageUrl || replaceImages) p.imageUrl = imageUrl;
          else plan.warnings.push(`${name}: vorhandenes Bild bleibt erhalten.`);
        }
        const candidatesImage = archive.filter(f => normalizeName(f.path.split('/').pop()!.replace(/\.[^.]+$/, '')) === normalizeName(name));
        let image: string | undefined;
        if (candidatesImage.length > 1) throw new Error(`Mehrere ZIP-Bilder passen zu „${name}“: ${candidatesImage.map(x => x.path).join(', ')}. ZIP bereinigen.`);
        if (candidatesImage.length && (!p.imageUrl || replaceImages)) { plan.images[p.id] = candidatesImage[0]; image = candidatesImage[0].path; }
        else if (candidatesImage.length) plan.warnings.push(`${name}: ZIP-Bild nicht übernommen, vorhandenes Bild bleibt erhalten.`);
        else if (archive.length) plan.warnings.push(`${name}: kein passendes ZIP-Bild; Artikel wird trotzdem importiert.`);
        record('Artikel', p, old, image); upsert(next.products, p);
      }));
    });
  }
  if (!found) plan.errors.push('Keine Tabelle mit der Kopfzeile „Produktname App“ gefunden.');
  if (sheets.Einstellungen) protect('Einstellungen', () => {
    const t = table(sheets.Einstellungen, 'Standort'); if (!t) throw new Error('Kopfzeile fehlt.');
    const used = new Set<string>();
    for (const r of t.records) {
      const loc = text(r.Standort) as Location;
      if (!locations.includes(loc) || used.has(loc)) throw new Error('Ungültiger oder doppelter Standort.');
      used.add(loc); next.pfandSettings[loc] = number(r.Pfand, 'Globaler Pfand');
    }
  });
  for (const loc of locations) if (base.pfandSettings[loc] !== next.pfandSettings[loc]) plan.rows.push({kind: 'Pfandeinstellung', name: loc, status: 'geändert', changes: [`${base.pfandSettings[loc]} → ${next.pfandSettings[loc]}`]});
  // Keep effective deposits coherent for existing and newly imported deposit articles.
  for (const p of next.products) if (p.isPfandArticle) {
    const old = base.products.find(x => x.id === p.id);
    const before = structuredClone(p); p.pfand = { ...next.pfandSettings };
    const preview = plan.rows.find(r => r.kind === 'Artikel' && r.id === p.id);
    if (stableStringify(before.pfand) !== stableStringify(p.pfand)) {
      if (preview) { preview.status = old ? 'geändert' : 'neu'; preview.changes.push(`Pfand (global): ${stableStringify(p.pfand)}`); }
      else record('Artikel', p, old);
    }
  }
  if (!validShots(next.shotOptions)) plan.errors.push('SCHUSS-Einstellungen enthalten ungültige oder doppelte Sorten.');
  next.categories = normalizeCategories(next.categories);
  for (const p of base.products) if (!seen.has(`Artikel:${p.id}`)) plan.rows.push({kind: 'Artikel', name: p.name, status: 'unverändert', changes: ['Nicht in der Datei; bleibt erhalten.']});
  for (const s of base.shotOptions) if (!seen.has(`SCHUSS:${s.id}`)) plan.rows.push({kind: 'SCHUSS', name: s.name, status: 'unverändert', changes: ['Nicht in der Datei; bleibt erhalten.']});
  return plan;
}

export async function readWorkbook(bytes: ArrayBuffer): Promise<SheetRows> {
  if (bytes.byteLength > 10 * 1024 * 1024) throw new Error('Excel-Datei ist größer als 10 MB.');
  // Bound decompressed XML before passing the archive to the workbook parser.
  let total = 0; let count = 0; let failed: Error | null = null;
  const check = new Unzip(file => {
    if (++count > 1000) throw new Error('Excel-Datei enthält zu viele ZIP-Einträge.');
    file.ondata = (error, chunk) => {
      if (error) { failed = error; return; }
      total += chunk.length;
      if (total > 80 * 1024 * 1024) { file.terminate(); throw new Error('Excel-Datei entpackt größer als 80 MB.'); }
    };
    file.start();
  });
  check.register(UnzipInflate); check.push(new Uint8Array(bytes), true);
  if (failed) throw failed;
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes);
  const sheets: SheetRows = {};
  for (const sheet of workbook.worksheets) {
    if (sheet.rowCount > 10000 || sheet.columnCount > 80) throw new Error('Excel-Tabelle überschreitet 10.000 Zeilen oder 80 Spalten.');
    const rows: unknown[][] = [];
    sheet.eachRow({ includeEmpty: true }, row => {
      const cells: unknown[] = [];
      row.eachCell({includeEmpty: true}, (cell, n) => {
        const v = cell.value;
        if (v && typeof v === 'object') throw new Error(`${sheet.name}!${cell.address}: Formeln und komplexe Zellwerte sind nicht erlaubt. Bitte als Werte speichern.`);
        cells[n - 1] = v;
      }); rows.push(cells);
    }); sheets[sheet.name] = rows;
  }
  return sheets;
}
export async function exportWorkbook(catalog: LocalCatalog): Promise<ArrayBuffer> {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  function add(name: string, rows: unknown[][]) {
    const s = workbook.addWorksheet(name); rows.forEach(r => s.addRow(r)); s.views = [{state: 'frozen', ySplit: 1}];
    s.getRow(1).font = {bold: true}; s.columns.forEach(c => { c.width = 24; });
  }
  const headers = ['ID','Produktname App','Warengruppe','VK 2026','VK DE','VK AT','Preis durch Mitarbeiter oder fix','Steuer DE in %','Steuer AT in %','Pfandartikel','Pfand DE','Pfand AT','Schuss erlaubt','Schusspreise','Verfügbar','Sortierung','Bild','Steuerklasse'];
  add('Artikel', [headers, ...catalog.products.map(p => [p.id,p.name,catalog.categories.find(c => c.id === p.categoryId)?.name ?? '',p.prices.Friedrichshafen,p.prices.Friedrichshafen,p.prices.Bregenz,p.hasIndividualPrice ? 'individuell eintragen' : 'fix',taxRateForProduct(p,'Friedrichshafen'),taxRateForProduct(p,'Bregenz'),!!p.isPfandArticle,p.pfand.Friedrichshafen,p.pfand.Bregenz,p.hasShot,JSON.stringify(p.shotPrices ?? {}),p.available,p.sortOrder,p.imageUrl,p.taxClass])]);
  add('SCHUSS', [headers, ...catalog.shotOptions.map(s => [s.id,s.name,'SCHUSS',s.price,s.locationPrices?.Friedrichshafen ?? '',s.locationPrices?.Bregenz ?? '','fix',19,20])]);
  add('Warengruppen', [['ID','Warengruppe','Icon','Farbe','Sortierung'], ...catalog.categories.map(c => [c.id,c.name,c.icon,c.color,c.sortOrder])]);
  add('Einstellungen', [['Standort','Pfand'], ...locations.map(loc => [loc,catalog.pfandSettings[loc]])]);
  return await workbook.xlsx.writeBuffer() as ArrayBuffer;
}

/** Streaming decompression with limits checked BEFORE accepting each output chunk. */
export function readImageZip(bytes: Uint8Array): ImageEntry[] {
  if (bytes.length > 100 * 1024 * 1024) throw new Error('ZIP ist größer als 100 MB.');
  const result: ImageEntry[] = []; let total = 0; let entries = 0; let failure: Error | null = null;
  const unzip = new Unzip(file => {
    if (++entries > 1000) throw new Error('ZIP enthält mehr als 1.000 Einträge.');
    if (file.name.endsWith('/') || file.name.startsWith('__MACOSX/') || /(^|\/)\./.test(file.name)) return;
    const ext = file.name.split('.').pop()?.toLowerCase();
    const mime = ({jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',bmp:'image/bmp'} as Record<string,string>)[ext ?? ''];
    if (!mime) return;
    let size = 0; const chunks: Uint8Array[] = [];
    file.ondata = (err, chunk, final) => {
      if (err) { failure = err; return; }
      size += chunk.length; total += chunk.length;
      if (size > 10 * 1024 * 1024 || total > 200 * 1024 * 1024) { file.terminate(); throw new Error('ZIP entpackt zu groß (10 MB je Bild / 200 MB insgesamt).'); }
      chunks.push(chunk);
      if (final) { const data = new Uint8Array(size); let offset = 0; for (const c of chunks) {data.set(c,offset); offset += c.length;} result.push({path:file.name,bytes:data,mime}); }
    }; file.start();
  }); unzip.register(UnzipInflate); unzip.push(bytes, true);
  if (failure) throw failure;
  return result;
}
