import { strToU8, zipSync } from 'fflate';
import type { LocalCatalog } from './catalogSync';
import { exportWorkbook, normalizeName } from './catalogTransfer';

type ImageFile = { fileName: string; bytes: Uint8Array };

function safeName(name: string): string {
  const result = Array.from(name.trim(), char => char.charCodeAt(0) < 32 ? '_' : char).join('')
    .replace(/[\\/:*?"<>|]/g, '_').replace(/[. ]+$/g, '').slice(0, 130);
  if (!result) throw new Error('Artikel ohne gültigen Namen kann nicht als Bilddatei exportiert werden.');
  return result;
}

function imageExtension(bytes: Uint8Array): string {
  if (bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((x, i) => bytes[i] === x)) return 'png';
  if (bytes.length > 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'jpg';
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
      String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return 'webp';
  if (bytes.length >= 2 && bytes[0] === 66 && bytes[1] === 77) return 'bmp';
  throw new Error('Bild ist kein unterstütztes PNG/JPG/WebP/BMP-Format.');
}

function ownStorageUrl(imageUrl: string, storageOrigin: string): string {
  if (!storageOrigin) throw new Error('Eigener Supabase-Speicher nicht konfiguriert.');
  const project = new URL(storageOrigin);
  if (project.protocol !== 'https:') throw new Error('Cloud-Speicher muss HTTPS verwenden.');
  const file = new URL(imageUrl);
  const expected = '/storage/v1/object/public/article-images/';
  // Compare parsed origins; never fetch external image hosts or data: URLs.
  if (file.protocol !== 'https:' || file.origin !== project.origin ||
      !file.pathname.startsWith(expected) ||
      !file.pathname.slice(expected.length) ||
      file.pathname.includes('..') || /%2f|%5c/i.test(file.pathname)) {
    throw new Error('Bild liegt nicht im eigenen Supabase-Artikelbilder-Speicher.');
  }
  return file.href;
}

async function retrieveImage(url: string, fetchImage: typeof fetch): Promise<Uint8Array> {
  const response = await fetchImage(url, { credentials: 'omit' });
  if (!response.ok) throw new Error(`Bildabruf fehlgeschlagen (HTTP ${response.status}).`);
  const length = Number(response.headers.get('content-length') || 0);
  if (length > 20 * 1024 * 1024) throw new Error('Ein Bild ist größer als 20 MB.');
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > 20 * 1024 * 1024) throw new Error('Ein Bild ist größer als 20 MB.');
  return bytes;
}

export interface CatalogBundle {
  bytes: Uint8Array;
  exportedImages: number;
  missingImages: string[];
}

/** One downloadable ZIP containing the actual image bytes and a readable
 * inventory of missing, unreachable or external files. Each exported filename
 * follows the existing importer's article-name matching convention.
 * Financial data and the JSON backup are untouched.
 */
export async function buildCatalogImagesZip(
  catalog: LocalCatalog,
  storageOrigin: string = import.meta.env.VITE_SUPABASE_URL,
  onProgress?: (message: string) => void,
  fetchImage: typeof fetch = fetch,
): Promise<CatalogBundle> {
  const images: ImageFile[] = [];
  const problems: string[] = [];
  const usedNames = new Set<string>();
  for (const [index, product] of catalog.products.entries()) {
    if (!product.imageUrl) {
      problems.push(`${product.name}: kein Artikelbild zugeordnet.`);
      continue;
    }
    onProgress?.(`Bild ${index + 1}/${catalog.products.length}: ${product.name}`);
    try {
      const url = ownStorageUrl(product.imageUrl, storageOrigin);
      const bytes = await retrieveImage(url, fetchImage);
      const filename = safeName(product.name) + '.' + imageExtension(bytes);
      const key = normalizeName(filename.replace(/\\.[^.]+$/, ''));
      if (usedNames.has(key)) throw new Error('Bilddateiname ist nicht eindeutig; automatische Zuordnung nicht möglich.');
      usedNames.add(key);
      images.push({ fileName: filename, bytes });
    } catch (error) {
      problems.push(`${product.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const listing = [
    'WOODMO 3.0 – Artikelbilder: Fehlende oder nicht exportierte Dateien',
    'Die Bilddateien der nachfolgenden Artikel sind NICHT im Archiv enthalten.',
    'Artikel ohne zugeordnetes Bild sind ebenfalls aufgeführt.',
    'Bitte vor einer Wiederherstellung die fehlenden Bilder separat sichern.',
    '',
    ...(problems.length ? problems : ['Keine fehlenden Bilder.']),
    '',
  ].join('\\n');
  const entries: Record<string, Uint8Array> = {
    ...Object.fromEntries(images.map(({ fileName, bytes }) => ['Bilder/' + fileName, bytes])),
    'FEHLENDE_BILDER.txt': strToU8(listing),
  };
  const bytes = zipSync(entries, { level: 0 });
  if (bytes.byteLength > 100 * 1024 * 1024) {
    throw new Error('Bilder-ZIP überschreitet das Importlimit von 100 MB. Bilder verkleinern.');
  }
  return {
    bytes, exportedImages: images.length, missingImages: problems,
  };
}

/** Existing catalog bundle: Excel plus the same restorable, audited image ZIP. */
export async function buildCatalogBundle(
  catalog: LocalCatalog, onProgress?: (message: string) => void,
  storageOrigin: string = import.meta.env.VITE_SUPABASE_URL,
  fetchImage: typeof fetch = fetch,
): Promise<CatalogBundle> {
  const picturesResult = await buildCatalogImagesZip(catalog, storageOrigin, onProgress, fetchImage);
  onProgress?.('Excel und Bilder-ZIP erstellen');
  const excel = new Uint8Array(await exportWorkbook(catalog));
  const manual = strToU8(
    'WOODMO Kassen-App 3.0: Katalog-Export mit Bildern\\n\\n' +
    '1. Dieses Paket entpacken.\\n' +
    '2. Excel-Datei bearbeiten (IDs, Tabellenüberschriften und Pfandzeilen beibehalten).\\n' +
    '3. Bilder in WOODMO_Bilder.zip aktualisieren; Dateiname = Artikelname in Excel.\\n' +
    '4. In der App die Excel-Datei und WOODMO_Bilder.zip auswählen. Vorschau kontrollieren.\\n' +
    '5. Bei gewünschten Bildänderungen die Option zum Ersetzen vorhandener Bilder ausdrücklich aktivieren.\\n' +
    '6. FEHLENDE_BILDER.txt im Bilder-ZIP prüfen und fehlende Fotos separat ergänzen.\\n' +
    'Wichtig: Keine Buchungen, Mitarbeiterpasswörter oder Cloud-Zugangsdaten im Paket.\\n'
  );
  const bundle = zipSync({
    'WOODMO_Katalog.xlsx': excel,
    'WOODMO_Bilder.zip': picturesResult.bytes,
    'LIESMICH.txt': manual,
  }, { level: 0 });
  if (bundle.byteLength > 150 * 1024 * 1024) throw new Error('Exportpaket größer als 150 MB. Bilder verkleinern und erneut versuchen.');
  return { bytes: bundle, exportedImages: picturesResult.exportedImages, missingImages: picturesResult.missingImages };
}
