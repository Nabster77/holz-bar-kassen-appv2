/**
 * WOODMO V3: deterministic, verifiable export of ALL booking-related tables.
 * This is the payload/validation layer, not permission to delete cloud data.
 * A reset must still require server-side admin authorization, a persisted
 * verified archive, an atomic ledger reset and generation reconciliation.
 */
export const RESET_BACKUP_FORMAT = 'woodmo-v3-booking-reset-v1';
export const RESET_BACKUP_SECTIONS = [
  'transactions',
  'cashSessions',
  'stornos',
  'dailyCloseReceipts',
  'dailyCloseCounters',
] as const;

export type ResetBackupSection = typeof RESET_BACKUP_SECTIONS[number];
export type ResetBackupData = Record<ResetBackupSection, readonly Record<string, unknown>[]>;
export type ResetBackupCounts = Record<ResetBackupSection, number>;

export interface ResetBackupEnvelope {
  format: typeof RESET_BACKUP_FORMAT;
  version: 1;
  exportedAt: string;
  data: ResetBackupData;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function checkData(value: unknown): asserts value is ResetBackupData {
  if (!isObject(value)) throw new Error('Buchungs-Backup enthält keinen Datenbereich.');
  for (const key of RESET_BACKUP_SECTIONS) {
    if (!Array.isArray(value[key]) || !(value[key] as unknown[]).every(isObject)) {
      throw new Error(`Buchungs-Backup unvollständig: ${key}.`);
    }
  }
}

/** Never mutate caller rows; sorting makes the archive independent of DB result order. */
export function prepareResetBackup(data: ResetBackupData, at = new Date()): ResetBackupEnvelope {
  checkData(data);
  if (!Number.isFinite(at.getTime())) throw new Error('Ungültiges Sicherungsdatum.');
  const snapshot = {} as Record<ResetBackupSection, Record<string, unknown>[]>;
  for (const key of RESET_BACKUP_SECTIONS) {
    snapshot[key] = data[key].map((item) => structuredClone(item))
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  }
  return { format: RESET_BACKUP_FORMAT, version: 1, exportedAt: at.toISOString(), data: snapshot };
}

export function resetBackupCounts(data: ResetBackupData): ResetBackupCounts {
  checkData(data);
  return Object.fromEntries(RESET_BACKUP_SECTIONS.map((key) => [key, data[key].length])) as ResetBackupCounts;
}

export async function digestResetBackup(contents: string): Promise<string> {
  const bytes = new TextEncoder().encode(contents);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), (item) => item.toString(16).padStart(2, '0')).join('');
}

/**
 * Read-after-write verification must use the ACTUAL persisted bytes, not just
 * the in-memory JSON that the browser attempted to download.
 */
export async function verifyResetBackup(
  persistedText: string,
  sha256: string,
  expectedCounts: ResetBackupCounts,
): Promise<ResetBackupEnvelope> {
  if (!/^[a-f0-9]{64}$/.test(sha256) || await digestResetBackup(persistedText) !== sha256) {
    throw new Error('Sicherungsprüfung fehlgeschlagen: SHA-256-Prüfsumme stimmt nicht.');
  }
  let parsed: unknown;
  try { parsed = JSON.parse(persistedText); }
  catch { throw new Error('Sicherungsprüfung fehlgeschlagen: ungültiges JSON.'); }
  if (!isObject(parsed) || parsed.format !== RESET_BACKUP_FORMAT || parsed.version !== 1 ||
      typeof parsed.exportedAt !== 'string' || !Number.isFinite(Date.parse(parsed.exportedAt))) {
    throw new Error('Sicherungsprüfung fehlgeschlagen: Format oder Zeitpunkt ungültig.');
  }
  checkData(parsed.data);
  const counts = resetBackupCounts(parsed.data);
  for (const section of RESET_BACKUP_SECTIONS) {
    if (!Number.isSafeInteger(expectedCounts[section]) || expectedCounts[section] < 0 ||
        counts[section] !== expectedCounts[section]) {
      throw new Error(`Sicherungsprüfung fehlgeschlagen: Anzahl ${section} stimmt nicht.`);
    }
  }
  return parsed as unknown as ResetBackupEnvelope;
}
