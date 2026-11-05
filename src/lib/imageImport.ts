import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

const TARGET_DPI = 150;
const MAX_DIMENSION = 800; // max width/height in px for display

export type ImportableFormat = 'image/jpeg' | 'image/png' | 'image/bmp' | 'application/pdf';

export const ACCEPTED_TYPES = '.jpg,.jpeg,.png,.bmp,.pdf';

export function isSupported(file: File): boolean {
  const type = file.type.toLowerCase();
  return (
    type === 'image/jpeg' ||
    type === 'image/jpg' ||
    type === 'image/png' ||
    type === 'image/bmp' ||
    type === 'application/pdf'
  );
}

export async function importFileToDataURL(file: File): Promise<string> {
  if (file.type === 'application/pdf') {
    return renderPDF(file);
  }
  return processImage(file);
}

async function processImage(file: File): Promise<string> {
  const bitmap = await loadBitmap(file);
  const canvas = renderToCanvas(bitmap, file.type);
  const format = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
  return canvas.toDataURL(format, 0.85);
}

async function loadBitmap(file: File): Promise<ImageBitmap> {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(file);
  }
  // Fallback for browsers without createImageBitmap
  return loadViaImg(file);
}

function loadViaImg(file: File): Promise<ImageBitmap> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      createImageBitmap(img).then(resolve).catch(reject);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Bild konnte nicht geladen werden'));
    };
    img.src = url;
  });
}

function renderToCanvas(bitmap: ImageBitmap, fileType: string): HTMLCanvasElement {
  const { width, height } = computeTargetSize(bitmap.width, bitmap.height, fileType);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas nicht verfügbar');
  ctx.drawImage(bitmap, 0, 0, width, height);
  return canvas;
}

function computeTargetSize(origW: number, origH: number, fileType: string): { width: number; height: number } {
  // BMP files often have embedded DPI metadata; we treat all images the same:
  // scale down so that the effective DPI is ~150 and max dimension is MAX_DIMENSION px.
  // For a typical product image, this means capping at 800px on the longest side.
  let width = origW;
  let height = origH;

  // Scale down if larger than MAX_DIMENSION
  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    const scale = MAX_DIMENSION / Math.max(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  return { width, height };
}

async function renderPDF(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const page = await pdf.getPage(1);

  // Render at 150 DPI. PDF default is 72 DPI, so scale = 150/72 ≈ 2.083.
  const viewport = page.getViewport({ scale: TARGET_DPI / 72 });
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas nicht verfügbar');

  await page.render({ canvasContext: ctx, viewport }).promise;

  // Scale down if too large for display
  let { width, height } = canvas;
  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    const scale = MAX_DIMENSION / Math.max(width, height);
    const scaled = document.createElement('canvas');
    scaled.width = Math.round(width * scale);
    scaled.height = Math.round(height * scale);
    const sctx = scaled.getContext('2d');
    if (!sctx) throw new Error('Canvas nicht verfügbar');
    sctx.drawImage(canvas, 0, 0, scaled.width, scaled.height);
    return scaled.toDataURL('image/jpeg', 0.85);
  }

  return canvas.toDataURL('image/jpeg', 0.85);
}
