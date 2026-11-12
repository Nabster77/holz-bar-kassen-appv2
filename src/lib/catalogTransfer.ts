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
/** Image filenames may spell German umlauts as ae/oe/ue instead of ä/ö/ü. */
function imageNameKey(value: string): string {
  return normalizeName(value.replace(/ä/gi, 'ae').replace(/ö/gi, 'oe').replace(/ü/gi, 'ue'));
}
function sameImageName(left: string, right: string): boolean {
  return normalizeName(left) === normalizeName(right) || imageNameKey(left) === imageNameKey(right);
}
/** Conservative similarity suggestions; never silently assign a fuzzy match. */
function imageSimilarity(article: string, filePath: string): number {
  const file = filePath.split('/').pop()!.replace(/\.[^.]+$/, '');
  const a = imageNameKey(article);
  const b = imageNameKey(file);
  if (!a || !b) return 0;
  if (a === b) return 1;
  // Preserve size distinctions: large and small images are not interchangeable.
  const size = (v: string) => /(?:\(l\)|\bgro(?:ß|ss)\b)/i.test(v) ? 'large' : /(?:\(s\)|\bklein\b)/i.test(v) ? 'small' : '';
  const sa = size(article), sb = size(file);
  if (sa && sb && sa !== sb) return 0;
  const distance = (x: string, y: string) => {
    let prev = Array.from({length:y.length+1}, (_,i)=>i);
    for (let i=1;i<=x.length;i++) {
      const cur = [i];
      for (let j=1;j<=y.length;j++) cur[j] = Math.min(cur[j-1]+1,prev[j]+1,prev[j-1]+(x[i-1]===y[j-1]?0:1));
      prev = cur;
    }
    return prev[y.length];
  };
  return 1 - distance(a,b)/Math.max(a.length,b.length);
}
/** Product sizes and copied-file suffixes do not affect the photo identity. */
function imageIdentity(value: string): string {
  // Remove Windows duplicate suffixes before stripping punctuation, e.g. Duftklotz(2).jpg.
  const withoutCopy = value.replace(/\s*\(\d+\)\s*$/, '');
  const withoutSize = withoutCopy
    .replace(/\s*\((?:s|m|l|xl)\)\s*/gi, ' ')
    .replace(/(?:^|[\s_-])(?:s|m|l|xl)\s*$/gi, ' ')
    .replace(/\b(?:klein|mittel|medium|gross|groß|large|extra\s*large|extra\s*groß)\b/gi, ' ');
  return imageNameKey(withoutSize)
    .replace(/^aromaboxen$/, 'aromabox')
    .replace(/^duftkloetze$/, 'duftklotz')
    .replace(/^duftklotze$/, 'duftklotz')
    .replace(/^kafee$/, 'kaffee')
    .replace(/^schnapssbrett/, 'schnapsbrett');
}
function imageStem(path: string): string {
  return path.split('/').pop()!.replace(/\.[^.]+$/, '');
}
const text = (v: unknown) => String(v ?? '').trim();
const field = (r: Record<string, unknown>, ...names: string[]) => {
  for (const name of names) if (Object.prototype.hasOwnProperty.call(r, name)) return r[name];
  return undefined;
};
const hasField = (r: Record<string, unknown>, ...names: string[]) => names.some(name => Object.prototype.hasOwnProperty.call(r, name));
function flag(v: unknown, label: string): boolean {
  const value = text(v).toLocaleLowerCase('de-DE');
  if (!value || ['-', 'nein', 'false', '0'].includes(value)) return false;
  if (['x', 'schuss', 'pfand', 'ja', 'true', '1'].includes(value)) return true;
  throw new Error(`${label}: Bitte „x“ für aktiv oder eine leere Zelle für inaktiv verwenden.`);
}
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
        const priceKind = text(field(r, 'Preis fix / individuell', 'Preis durch Mitarbeiter oder fix')).toLocaleLowerCase('de-DE');
        if (!['fix', 'individuell eintragen', 'individuell'].includes(priceKind)) throw new Error('Preisart muss „fix“ oder „individuell“ sein.');
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
        const individual = priceKind === 'individuell eintragen' || priceKind === 'individuell';
        const shared = number(field(r, 'VK', 'VK 2026'), 'Grundpreis', individual ? old?.prices.Friedrichshafen ?? 0 : oldShot?.price);
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
          hasShot: hasField(r, 'Schuss') ? flag(r.Schuss, 'Schuss') : bool(r['Schuss erlaubt'], old?.hasShot ?? false), hasIndividualPrice: individual,
          isPfandArticle: hasField(r, 'Pfand') ? flag(r.Pfand, 'Pfand') : bool(r.Pfandartikel, old?.isPfandArticle ?? false), pfand: { Friedrichshafen: number(r['Pfand DE'], 'Pfand DE', old?.pfand.Friedrichshafen ?? 0), Bregenz: number(r['Pfand AT'], 'Pfand AT', old?.pfand.Bregenz ?? 0) } };
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
        const exactImages = archive.filter(f => sameImageName(imageStem(f.path), name));
        const identityImages = archive.filter(f => imageIdentity(imageStem(f.path)) === imageIdentity(name));
        // A name without size suffix is the same product as (S), (M), (L), (XL),
        // klein, mittel, groß. Prefer the compact S variant, then M, L, XL.
        // Exact filename matches always take priority; tie-break by stable ZIP path.
        const imageSizeRank = (path: string) => {
          const stem = imageStem(path).toLocaleLowerCase('de-DE');
          if (/(?:\(s\)|(?:^|[\s_-])s$|\bklein\b)/i.test(stem)) return 0;
          if (/(?:\(m\)|(?:^|[\s_-])m$|\bmittel\b|\bmedium\b)/i.test(stem)) return 1;
          if (/(?:\(l\)|(?:^|[\s_-])l$|\bgroß\b|\bgross\b|\blarge\b)/i.test(stem)) return 2;
          if (/(?:\(xl\)|(?:^|[\s_-])xl$|\bextra\s*(?:groß|gross|large)\b)/i.test(stem)) return 3;
          return 4;
        };
        const candidatesImage = (exactImages.length ? exactImages : identityImages)
          .sort((a,b) => imageSizeRank(a.path) - imageSizeRank(b.path) || a.path.localeCompare(b.path, 'de'));
        let image: string | undefined;
        // If two equally ranked images match the same article, choosing one
        // would be an unreviewed overwrite. Import the article, but skip its
        // image and surface the conflict in the preview.
        const ambiguousImage = candidatesImage.length > 1 &&
          imageSizeRank(candidatesImage[0].path) === imageSizeRank(candidatesImage[1].path);
        if (ambiguousImage) {
          plan.warnings.push(`${name}: mehrere gleichwertige ZIP-Bilder gefunden (${candidatesImage.map(f => f.path).join(', ')}). Keine automatische Bildzuordnung; bitte Bildnamen eindeutig machen.`);
        } else if (candidatesImage.length && (!p.imageUrl || replaceImages || /[?&]woodmoIllustration=1(?:&|$)/.test(p.imageUrl))) {
          plan.images[p.id] = candidatesImage[0];
          image = candidatesImage[0].path;
        } else if (candidatesImage.length) {
          plan.warnings.push(`${name}: ZIP-Bild nicht übernommen, vorhandenes Bild bleibt erhalten.`);
        }
        else if (archive.length) {
          const suggestions = archive.map(f => ({path:f.path, score:imageSimilarity(name,f.path)}))
            .filter(f => f.score >= 0.75 && f.score < 1)
            .sort((a,b) => b.score-a.score).slice(0,3);
          const hint = suggestions.length ? ` Mögliche Bilder (nur Vorschläge, nicht übernommen): ${suggestions.map(f => `${f.path} (${Math.round(f.score*100)} %)`).join(', ')}.` : '';
          plan.warnings.push(`${name}: kein exaktes ZIP-Bild;${hint} Artikel wird trotzdem importiert.`);
        }
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

function zipSignature(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b &&
    ((bytes[2] === 3 && bytes[3] === 4) || (bytes[2] === 5 && bytes[3] === 6) || (bytes[2] === 7 && bytes[3] === 8));
}
function validImageSignature(bytes: Uint8Array, mime: string): boolean {
  if (mime === 'image/png') return bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((v,i) => bytes[i] === v);
  if (mime === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (mime === 'image/webp') return bytes.length >= 12 && String.fromCharCode(...bytes.slice(0,4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8,12)) === 'WEBP';
  if (mime === 'image/bmp') return bytes.length >= 2 && bytes[0] === 66 && bytes[1] === 77;
  return false;
}
export async function readWorkbook(bytes: ArrayBuffer): Promise<SheetRows> {
  if (bytes.byteLength > 10 * 1024 * 1024) throw new Error('Excel-Datei ist größer als 10 MB.');
  if (!zipSignature(new Uint8Array(bytes))) throw new Error('Ungültige Excel-Datei. Bitte eine echte .xlsx-Datei auswählen.');
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
  try { await workbook.xlsx.load(bytes); }
  catch { throw new Error('Die ausgewählte Datei ist keine gültige Excel-Arbeitsmappe (.xlsx). Bitte die richtige Datei auswählen.'); }
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
export async function exportTemplateWorkbook(): Promise<ArrayBuffer> {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Preisliste');
  sheet.addRow(['Artikel_Verkaufspreise_2026']);
  sheet.addRow(['', 'Pfand']);
  sheet.addRow(['Friedrichshafen', 1]);
  sheet.addRow(['Bregenz', 2]);
  sheet.addRow([]);
  sheet.addRow(['Produktname App', 'VK', 'Warengruppe', 'Preis fix / individuell', 'Steuer DE in %', 'Steuer AT in %', 'Schuss', 'Pfand']);
  sheet.addRow(['Glühwein Rot', 4.5, 'Getränke', 'fix', 19, 20, 'x', 'x']);
  sheet.addRow(['Glühwein Weiß', 4.5, 'Getränke', 'fix', 19, 20, 'x', 'x']);
  sheet.addRow(['Küchenbretter', 0, 'Handwerk', 'individuell', 19, 20, '', '']);
  sheet.getRow(6).font = {bold: true};
  sheet.columns.forEach(column => {column.width = 24;});
  return await workbook.xlsx.writeBuffer() as ArrayBuffer;
}
export async function exportWorkbook(catalog: LocalCatalog): Promise<ArrayBuffer> {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  const add = (name: string, rows: unknown[][]) => {
    const sheet = workbook.addWorksheet(name);
    rows.forEach(row => sheet.addRow(row));
    sheet.columns.forEach(column => {column.width = 22;});
    return sheet;
  };
  const headers = ['Produktname App', 'VK', 'Warengruppe', 'Preis fix / individuell',
    'Steuer DE in %', 'Steuer AT in %', 'Schuss', 'Pfand',
    'ID', 'VK DE', 'VK AT', 'Pfand DE', 'Pfand AT', 'Verfügbar',
    'Sortierung', 'Bild', 'Steuerklasse', 'Schusspreise'];
  const rows: unknown[][] = [
    ['Artikel_Verkaufspreise_2026'],
    ['', 'Pfand'],
    ['Friedrichshafen', catalog.pfandSettings.Friedrichshafen],
    ['Bregenz', catalog.pfandSettings.Bregenz],
    [],
    headers,
    ...catalog.products.map(p => [
      p.name, p.prices.Friedrichshafen,
      catalog.categories.find(c => c.id === p.categoryId)?.name ?? '',
      p.hasIndividualPrice ? 'individuell' : 'fix',
      taxRateForProduct(p, 'Friedrichshafen'), taxRateForProduct(p, 'Bregenz'),
      p.hasShot ? 'x' : '', p.isPfandArticle ? 'x' : '',
      p.id, p.prices.Friedrichshafen, p.prices.Bregenz,
      p.pfand.Friedrichshafen, p.pfand.Bregenz, p.available,
      p.sortOrder, p.imageUrl, p.taxClass, JSON.stringify(p.shotPrices ?? {})
    ])
  ];
  const sheet = add('Preisliste', rows);
  sheet.getRow(6).font = {bold: true};
  add('SCHUSS', [
    ['ID', 'Produktname App', 'Warengruppe', 'VK', 'VK DE', 'VK AT',
      'Preis fix / individuell', 'Steuer DE in %', 'Steuer AT in %'],
    ...catalog.shotOptions.map(shot => [
      shot.id, shot.name, 'SCHUSS', shot.price,
      shot.locationPrices?.Friedrichshafen ?? '',
      shot.locationPrices?.Bregenz ?? '', 'fix', 19, 20
    ])
  ]);
  add('Warengruppen', [
    ['ID', 'Warengruppe', 'Icon', 'Farbe', 'Sortierung'],
    ...catalog.categories.map(c => [c.id, c.name, c.icon, c.color, c.sortOrder])
  ]);
  add('Einstellungen', [
    ['Standort', 'Pfand'],
    ...locations.map(loc => [loc, catalog.pfandSettings[loc]])
  ]);
  return await workbook.xlsx.writeBuffer() as ArrayBuffer;
}

/** fflate exposes legacy CP437 ZIP entry names as byte-valued characters. */
const cp437High = "ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ";
function decodeZipPath(path: string): string {
  // Decode only legacy byte-valued paths. Already-correct Unicode paths remain intact.
  if (!/[\u0080-\u009f]/.test(path)) return path;
  return Array.from(path, char => {
    const n = char.charCodeAt(0);
    return n >= 128 && n <= 255 ? cp437High[n - 128] : char;
  }).join('');
}

/** Streaming decompression with limits checked BEFORE accepting each output chunk. */
export function readImageZip(bytes: Uint8Array): ImageEntry[] {
  if (bytes.length > 100 * 1024 * 1024) throw new Error('ZIP ist größer als 100 MB.');
  if (!zipSignature(bytes)) throw new Error('Ungültige Bilder-ZIP. Bitte eine echte .zip-Datei mit Produktbildern auswählen.');
  const result: ImageEntry[] = []; let total = 0; let entries = 0; let failure: Error | null = null;
  const unzip = new Unzip(file => {
    const decodedPath = decodeZipPath(file.name);
    if (++entries > 1000) throw new Error('ZIP enthält mehr als 1.000 Einträge.');
    if (decodedPath.endsWith('/') || decodedPath.startsWith('__MACOSX/') || /(^|\/)\./.test(decodedPath)) return;
    const ext = decodedPath.split('.').pop()?.toLowerCase();
    const mime = ({jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',bmp:'image/bmp'} as Record<string,string>)[ext ?? ''];
    if (!mime) return;
    let size = 0; const chunks: Uint8Array[] = [];
    file.ondata = (err, chunk, final) => {
      if (err) { failure = err; return; }
      size += chunk.length; total += chunk.length;
      if (size > 20 * 1024 * 1024 || total > 200 * 1024 * 1024) { file.terminate(); throw new Error('Ein Bild überschreitet die technische Verarbeitungsgrenze von 20 MB oder das entpackte Archiv überschreitet 200 MB.'); }
      chunks.push(chunk);
      if (final) { const data = new Uint8Array(size); let offset = 0; for (const c of chunks) {data.set(c,offset); offset += c.length;} if (!validImageSignature(data, mime)) { failure = new Error(`„${decodedPath}“ hat kein gültiges Bildformat (${ext}). Bitte das Bild neu speichern.`); return; } result.push({path:decodedPath,bytes:data,mime}); }
    }; file.start();
  }); unzip.register(UnzipInflate); unzip.push(bytes, true);
  if (failure) throw failure;
  if (!result.length) throw new Error('Die Bilder-ZIP enthält keine unterstützten Bilder (PNG, JPG, JPEG, WebP oder BMP).');
  return result;
}
