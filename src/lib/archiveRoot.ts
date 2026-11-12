/**
 * The user only chooses the parent folder. WOODMO creates the named archive
 * root and subdirectories beneath it after the browser grants permission.
 */
export function archiveRootName(configuredAt: number): string {
  if (!Number.isFinite(configuredAt)) throw new Error('Ungültiges Datum der Geräte-Einrichtung.');
  const year = new Date(configuredAt).getFullYear();
  if (year < 2000 || year > 9999) throw new Error('Ungültiges Archivjahr.');
  return `Kasse ${String(year).slice(-2)}`;
}

export type BackupSlot = 'Backup1' | 'Backup2';
export function backupDirectorySegments(configuredAt: number, slot: BackupSlot): string[] {
  if (slot !== 'Backup1' && slot !== 'Backup2') throw new Error('Unbekannter Sicherungsordner.');
  return [archiveRootName(configuredAt), 'Sicherung', slot];
}
