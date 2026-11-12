import { archiveRootName } from './archiveRoot';
import { archiveSubfolders, type ArchiveReport } from './archivePaths';

const LOCATIONS = ['Friedrichshafen', 'Bregenz', 'Alle-Standorte'] as const;

/**
 * Create only missing directories. Existing handles, files and subdirectories
 * are never replaced or cleared. A new annual root is created on first use
 * after the DE/AT year changes, even when re-exporting an older report.
 */
export async function ensureYearStructure(
  parent: FileSystemDirectoryHandle,
  at: number,
): Promise<FileSystemDirectoryHandle> {
  const root = await parent.getDirectoryHandle(archiveRootName(at), { create: true });
  for (const location of LOCATIONS) {
    await root.getDirectoryHandle(location, { create: true });
  }
  const backup = await root.getDirectoryHandle('Sicherung', { create: true });
  await backup.getDirectoryHandle('Backup1', { create: true });
  await backup.getDirectoryHandle('Backup2', { create: true });
  return root;
}

/**
 * Month and report-type folders are created on demand, not all 12 months or
 * all report types ahead of time. Older reports stay in their original year.
 */
export async function ensureReportFolder(
  parent: FileSystemDirectoryHandle,
  report: ArchiveReport,
  now = Date.now(),
): Promise<FileSystemDirectoryHandle> {
  await ensureYearStructure(parent, now);
  const root = await ensureYearStructure(parent, report.reportPeriodStart ?? now);
  let target = root;
  for (const segment of archiveSubfolders(report)) {
    target = await target.getDirectoryHandle(segment, { create: true });
  }
  return target;
}

async function sameBytes(file: File, proposed: Blob): Promise<boolean> {
  if (file.size !== proposed.size) return false;
  const [previous, next] = await Promise.all([file.arrayBuffer(), proposed.arrayBuffer()]);
  const left = new Uint8Array(previous);
  const right = new Uint8Array(next);
  return left.every((value, index) => value === right[index]);
}

/**
 * A finalized receipt is immutable. A byte-identical second export is a
 * no-op; different contents produce an explicit conflict, never overwrite.
 * Ordinary, reproducible reports may be updated when their bytes differ.
 */
export async function savePdfInFolder(
  target: FileSystemDirectoryHandle,
  name: string,
  pdf: Blob,
  finalized: boolean,
): Promise<'created' | 'unchanged' | 'updated'> {
  let existing: FileSystemFileHandle | null = null;
  try {
    existing = await target.getFileHandle(name);
  } catch (error) {
    if (!(error instanceof DOMException && error.name === 'NotFoundError')) throw error;
  }
  if (existing) {
    const prior = await existing.getFile();
    if (prior.size === 0 && finalized) {
      throw new Error('Ein vorhandener Tagesabschluss ist leer. Bitte das Archiv prüfen.');
    }
    if (await sameBytes(prior, pdf)) return 'unchanged';
    if (finalized) {
      throw new Error('PDF-Konflikt: Ein endgültiger Tagesabschluss mit diesem Dateinamen existiert bereits mit anderem Inhalt. Die vorhandene Datei bleibt unverändert. Bitte den Beleg prüfen und eine getrennte Neuausgabe erstellen.');
    }
  }
  const handle = existing ?? await target.getFileHandle(name, { create: true });
  const writer = await handle.createWritable();
  try {
    await writer.write(pdf);
    await writer.close();
  } catch (error) {
    try { await writer.abort(); } catch { /* Preserve original error. */ }
    throw error;
  }
  return existing ? 'updated' : 'created';
}
