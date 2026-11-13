import type { StornoRecord } from './stornoRules';

/** Guardrail for old and new full backups. Append-only financial evidence
 * cannot be restored from an untrusted browser JSON file into the live DB;
 * such a restore must be performed with a separately audited administrator
 * procedure. This check prevents falsely reporting full recovery.
 */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(obj).sort()
      .filter((key) => obj[key] !== undefined)
      .map((key) => [key, canonical(obj[key])]));
  }
  return value;
}

export function assertBackupStornosPresent(
  backupStornos: unknown,
  cloudStornos: readonly StornoRecord[],
): void {
  if (backupStornos === undefined) return; // pre-storno backup format
  if (!Array.isArray(backupStornos)) {
    throw new Error('Datensicherung enthält keine gültige Stornobeleg-Liste.');
  }
  const byId = new Map(cloudStornos.map((row) => [row.id, row]));
  const seen = new Set<string>();
  for (const backedUp of backupStornos) {
    if (!backedUp || typeof backedUp !== 'object' || Array.isArray(backedUp)) {
      throw new Error('Ungültiger Stornonachweis in der Datensicherung.');
    }
    const record = backedUp as StornoRecord;
    if (typeof record.id !== 'string' || !record.id || seen.has(record.id)) {
      throw new Error('Doppelte oder fehlende Stornobeleg-ID in der Sicherung.');
    }
    seen.add(record.id);
    const cloud = byId.get(record.id);
    if (!cloud) {
      throw new Error(
        'Ein Stornobeleg der Datensicherung fehlt in der V3-Cloud. ' +
        'Wiederherstellung gestoppt, damit kein unveränderlicher Buchungsnachweis verloren geht. ' +
        'Bitte die Sicherung und die Cloud mit einem Administrator abgleichen.',
      );
    }
    if (JSON.stringify(canonical(cloud)) !== JSON.stringify(canonical(record))) {
      throw new Error(
        'Ein gespeicherter Stornobeleg unterscheidet sich von der Sicherung. ' +
        'Wiederherstellung aus Sicherheitsgründen abgebrochen.',
      );
    }
  }
}
