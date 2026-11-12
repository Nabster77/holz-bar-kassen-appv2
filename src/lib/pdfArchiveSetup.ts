/** Local-device PDF storage is not a Supabase upload. */
export const PDF_ARCHIVE_SETUP_EVENT = 'woodmo:pdf-archive-setup-required';

export class PdfArchiveSetupRequired extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PdfArchiveSetupRequired';
  }
}

/** Tell the app shell to show the warning and the existing device Setup. */
export function requirePdfArchiveSetup(message: string): never {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(PDF_ARCHIVE_SETUP_EVENT, { detail: { message } }));
  }
  throw new PdfArchiveSetupRequired(message);
}
