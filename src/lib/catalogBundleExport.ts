import { strToU8, zipSync } from 'fflate';
import type { LocalCatalog } from './catalogSync';
import { exportWorkbook, normalizeName } from './catalogTransfer';

type ImageFile = { fileName: string; bytes: Uint8Array };

function safeName(name: string): string {
  const result = name.trim().replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/[. ]+$/g, '').slice(0, 130);
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

async function retrieveImage(url: string): Promise<Uint8Array> {
  // Allow only URLs already referenced by a catalog article. Never attach credentials.
  if (!/^https?:\/\//i.test(url) && !url.startsWith('/')) {
    throw new Error('Bildquelle ist keine abrufbare HTTP(S)- oder lokale URL.');
  }
  const response = await fetch(url, { credentials: 'omit' });
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

/** Round-trip bundle: one .xlsx and one separate pictures .zip inside the outer .zip.
 * Both files can be extracted and selected unchanged in the existing importer.
 * No images are silently substituted or omitted if they were configured.
 */
export async function buildCatalogBundle(catalog: LocalCatalog, onProgress?: (message: string) => void): Promise<CatalogBundle> {
  const imageEntries: ImageFile[] = [];
  const missingImages: string[] = [];
  const fileNames = new Set<string>();
  for (const [index, product] of catalog.products.entries()) {
    if (!product.imageUrl) {
      missingImages.push(product.name);
      continue;
    }
    onProgress?.(`Produktbild ${index + 1}/${catalog.products.length}: ${product.name}`);
    let bytes: Uint8Array;
    try {
      bytes = await retrieveImage(product.imageUrl);
    } catch (cause) {
      throw new Error(`Produktbild „${product.name}“ konnte nicht exportiert werden: ${cause instanceof Error ? cause.message : String(cause)}. Export abgebrochen; der Katalog wurde nicht verändert.`);
    }
    const fileName = safeName(product.name) + '.' + imageExtension(bytes);
    const key = normalizeName(fileName.replace(/\.[^.]+$/, ''));
    if (fileNames.has(key)) throw new Error(`Mehrere Produkte benötigen denselben Bildnamen: „${product.name}“. Bitte Namen eindeutig machen. Export abgebrochen.`);
    fileNames.add(key);
    imageEntries.push({ fileName, bytes });
  }
  onProgress?.('Excel und Bilder-ZIP erstellen');
  const excel = new Uint8Array(await exportWorkbook(catalog));
  const pictures = zipSync(Object.fromEntries(imageEntries.map(({fileName, bytes}) => ['Bilder/' + fileName, bytes])), { level: 0 });
  const manual = strToU8(
    'WOODMO Kassen-App 3.0: Katalog-Export mit Bildern\n\n' +
    '1. Dieses Paket entpacken.\n' +
    '2. Excel-Datei bearbeiten (IDs, Tabellenüberschriften und Pfandzeilen beibehalten).\n' +
    '3. Bilder in WOODMO_Bilder.zip aktualisieren; Dateiname = Artikelname in Excel.\n' +
    '4. In der App die Excel-Datei und WOODMO_Bilder.zip auswählen. Vorschau kontrollieren.\n' +
    '5. Bei gewünschten Bildänderungen die Option zum Ersetzen vorhandener Bilder ausdrücklich aktivieren.\n' +
    '6. Fehlende Bilder können separat ergänzt werden. Entfernte Artikel in Excel werden nicht automatisch gelöscht.\n' +
    'Wichtig: Keine Buchungen, Mitarbeiterpasswörter oder Cloud-Zugangsdaten im Paket.\n'
  );
  const bundle = zipSync({
    'WOODMO_Katalog.xlsx': excel,
    'WOODMO_Bilder.zip': pictures,
    'LIESMICH.txt': manual,
  }, { level: 0 });
  if (bundle.byteLength > 150 * 1024 * 1024) throw new Error('Exportpaket größer als 150 MB. Bilder verkleinern und erneut versuchen.');
  return { bytes: bundle, exportedImages: imageEntries.length, missingImages };
}
