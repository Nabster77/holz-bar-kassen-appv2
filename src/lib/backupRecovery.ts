import { SHOT_SETTING_ID, validShots } from '@/lib/shotCatalog';
import type { ShotOption } from '@/types';
import { fetchLatestBookingReset, rememberBookingReset } from '@/lib/bookingReset';
import { fetchCatalogRows, pushCatalogRows } from '@/lib/catalogCloud';
import { buildLocalEntries, PFAND_SETTING_ID, type CatalogRow, type CatalogEntry } from '@/lib/catalogSync';
import { supabase } from '@/lib/supabaseClient';
import { loadJSON, STORAGE_KEYS } from '@/lib/storage';
import { fetchCloudData } from '@/lib/cloudPull';
import { loadCloudStornos } from '@/lib/stornoCloud';
import { assertBackupStornosPresent } from '@/lib/stornoBackupIntegrity';
import { assessBackupRestore, backupMergeConfirmation } from '@/lib/backupRestoreSafety';
import type { StornoRecord } from '@/lib/stornoRules';
import { discardEntriesBeforeGeneration, enqueueEntries, flushOutbox, type OutboxEntry } from '@/lib/outbox';
import { recoverableTransactions, recoverableCashSessions } from '@/lib/recoveryGuards';
import { DEFAULT_PFAND_SETTINGS } from '@/lib/seed';
import { fetchAllStaffRows, pushStaffUser, type StaffRow } from '@/lib/staffDirectory';
import type { CashSession, Category, Location, PfandSettings, Product, StaffUser, Transaction } from '@/types';

type BackupData = {
  transactions?: Transaction[];
  cashSessions?: CashSession[];
  stornos?: StornoRecord[];
  categories?: Category[];
  products?: Product[];
  pfandSettings?: PfandSettings;
  shotOptions?: ShotOption[];
  selectedLocation?: Location;
  staffUsers?: StaffUser[];
  managerCredential?: unknown;
  lastStaffId?: string | null;
  theme?: unknown;
  rootPasswordChanged?: boolean;
  rootPasswordNoticeDismissed?: boolean;
  catalogVersions?: Record<string, CatalogEntry>;
  serverRecovery?: Record<string, unknown>;
};

export type CompleteBackup = {
  version?: number;
  exportedAt?: string;
  data?: BackupData;
};

export type RestoredBackup = {
  data: Required<Pick<BackupData, 'transactions' | 'cashSessions' | 'categories' | 'products' | 'pfandSettings'>> & BackupData;
  cloudReset: { resetAt: number; generation: number } | null;
  staffUsers: StaffUser[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isIdentified<T extends { id: string }>(value: unknown): value is T {
  return isRecord(value) && typeof value.id === 'string';
}

function list<T extends { id: string }>(value: unknown): T[] {
  return Array.isArray(value) ? value.filter(isIdentified<T>) : [];
}

function newestSessionTime(session: CashSession): number {
  return Math.max(
    session.openedAt || 0,
    session.closedAt || 0,
    session.dailyCloseFinalizedAt || 0,
    ...(session.entries ?? []).map((entry) => entry.timestamp || 0),
    ...(session.corrections ?? []).map((correction) => correction.timestamp || 0),
    ...(session.activities ?? []).map((activity) => activity.timestamp || 0),
    ...(session.staffLoginIntervals ?? []).flatMap((interval) => [interval.loginAt || 0, interval.logoutAt || 0]),
  );
}

export async function exportRecoveryMetadata(): Promise<Pick<BackupData, 'catalogVersions' | 'serverRecovery'>> {
  if (!supabase || !navigator.onLine) throw new Error('Für eine vollständige Sicherung bitte eine Verbindung zur Cloud herstellen.');
  const { data, error } = await supabase.rpc('export_pos_recovery_metadata');
  if (error) throw new Error(`Vollständige Sicherung nicht möglich: ${error.message}`);
  const state = loadJSON<{ synced: Record<string, CatalogEntry>; pending: Record<string, CatalogEntry> }>(STORAGE_KEYS.catalogSync, { synced: {}, pending: {} });
  return { catalogVersions: { ...state.synced, ...state.pending }, serverRecovery: data };
}

function mergeById<T extends { id: string }>(cloud: T[], backup: T[]): T[] {
  const merged = new Map(cloud.map((entry) => [entry.id, entry]));
  backup.forEach((entry) => merged.set(entry.id, entry));
  return [...merged.values()];
}

function catalogKey(kind: CatalogRow['kind'], id: string): string {
  return `${kind}:${id}`;
}

function catalogToLocal(rows: CatalogRow[]): Pick<Required<BackupData>, 'categories' | 'products' | 'pfandSettings'> & Pick<BackupData, 'shotOptions'> {
  const categories = rows
    .filter((row) => row.kind === 'category' && !row.deleted)
    .map((row) => row.data as Category);
  const products = rows
    .filter((row) => row.kind === 'product' && !row.deleted)
    .map((row) => row.data as Product);
  const setting = rows.find((row) => row.kind === 'setting' && row.id === PFAND_SETTING_ID && !row.deleted);
  const shots = rows.find(row => row.kind === 'setting' && row.id === SHOT_SETTING_ID && !row.deleted);
  return { categories, products, shotOptions: validShots(shots?.data) ? shots.data : undefined, pfandSettings: (setting?.data as PfandSettings | undefined) ?? DEFAULT_PFAND_SETTINGS };
}

function sanitizeBackupStaff(value: unknown, fallbackUpdatedAt: number): StaffUser[] {
  return list<StaffUser>(value).map((user) => ({
    ...user,
    securityQuestion: user.securityQuestion ?? null,
    securityConfigured: Boolean(user.securityConfigured && user.securityQuestion),
    updatedAt: Number(user.updatedAt) || fallbackUpdatedAt,
  }));
}

function cloudUsers(rows: StaffRow[]): StaffUser[] {
  return rows
    .filter((row) => !row.deleted && isIdentified<StaffUser>(row.data))
    .map((row) => ({
      ...row.data,
      securityQuestion: row.data.securityQuestion ?? null,
      securityConfigured: Boolean(row.data.securityConfigured && row.data.securityQuestion),
      updatedAt: Number(row.data.updatedAt) || row.updated_at,
    }));
}

// A restore is intentionally a per-record merge. A newer cloud row always
// wins, while a missing or older cloud row may be recovered from the backup.
export async function restoreBackupSafely(backup: CompleteBackup): Promise<RestoredBackup> {
  if (!backup.data || typeof backup.exportedAt !== 'string') {
    throw new Error('Ungültige Backup-Datei: Zeitstempel oder Daten fehlen.');
  }
  const backupTime = Date.parse(backup.exportedAt);
  if (!Number.isFinite(backupTime)) throw new Error('Ungültige Backup-Datei: Exportzeit ist nicht lesbar.');
  if (!navigator.onLine) throw new Error('Eine Wiederherstellung ist nur online möglich, damit neuere Cloud-Daten geschützt bleiben.');

  const [reset, catalogRows, staffRows] = await Promise.all([
    fetchLatestBookingReset(),
    fetchCatalogRows(),
    fetchAllStaffRows(),
  ]);
  const resetAt = reset?.resetAt ?? 0;
  // A pre-reset financial backup must never be silently "successfully"
  // imported without its sales/session history. Check before ANY writes.
  if (backupTime <= resetAt &&
      ((backup.data.transactions?.length ?? 0) > 0 ||
       (backup.data.cashSessions?.length ?? 0) > 0)) {
    assessBackupRestore({
      transactions: backup.data.transactions ?? [],
      cashSessions: backup.data.cashSessions ?? [],
    }, { transactions: [], cashSessions: [] }, backupTime, resetAt,
    { transactions: [], cashSessions: [] });
  }
  // Query the authoritative generation, not the browser's possibly stale
  // knownBookingReset() value after a reset on another device.
  const authoritativeStornos = await loadCloudStornos(reset?.generation ?? 0);
  // Fail BEFORE modifying articles, staff, sessions or sales. A browser may
  // never synthesize immutable cloud Stornos from a backup JSON file.
  assertBackupStornosPresent(backup.data.stornos, authoritativeStornos);
  // A backup restore must NOT delete unuploaded sales from this device.
  // First flush valid pending entries, and discard only entries from a
  // booking generation that the cloud has already reset.
  await discardEntriesBeforeGeneration(reset?.generation ?? 0);
  while (await flushOutbox()) {
    // Wait for all previously queued entries before taking a cloud snapshot.
  }
  const cloud = await fetchCloudData(null, reset?.generation ?? 0);

  const backupTransactions = list<Transaction>(backup.data.transactions);
  const backupSessions = list<CashSession>(backup.data.cashSessions);
  const backupCategories = list<Category>(backup.data.categories);
  const backupProducts = list<Product>(backup.data.products);
  const backupStaff = sanitizeBackupStaff(backup.data.staffUsers, backupTime);
  const backupPfand = backup.data.pfandSettings ?? null;

  const cloudCatalogByKey = new Map(catalogRows.map((row) => [catalogKey(row.kind, row.id), row]));
  const canRestoreCatalog = (kind: CatalogRow['kind'], id: string) => {
    const cloudRow = cloudCatalogByKey.get(catalogKey(kind, id));
    const revision = backup.data?.catalogVersions?.[catalogKey(kind, id)];
    // Legacy backups without record revisions may fill gaps, but cannot
    // prove that they are newer than an existing cloud object.
    return !cloudRow || Boolean(revision && revision.updatedAt > cloudRow.updated_at);
  };
  const restorableCategories = backupCategories.filter((category) => canRestoreCatalog('category', category.id));
  const restorableProducts = backupProducts.filter((product) => canRestoreCatalog('product', product.id));
  const restorePfand = Boolean(backupPfand && canRestoreCatalog('setting', PFAND_SETTING_ID));
  if (backup.data.shotOptions !== undefined && !validShots(backup.data.shotOptions)) throw new Error('Ungültige SCHUSS-Einstellungen im Backup.');
  const restoreShots = validShots(backup.data.shotOptions) && canRestoreCatalog('setting', SHOT_SETTING_ID);
  const cloudCatalog = catalogToLocal(catalogRows);
  const restoredShots = restoreShots ? backup.data.shotOptions : cloudCatalog.shotOptions;
  const restoredPfand = restorePfand && backupPfand ? backupPfand : cloudCatalog.pfandSettings;

  const cloudStaffById = new Map(staffRows.map((row) => [row.id, row]));
  const restorableStaff = backupStaff.filter((user) => {
    const cloudRow = cloudStaffById.get(user.id);
    // Explicitly deleted identities must never be revived by an old backup.
    if (cloudRow?.deleted) return false;
    return !cloudRow || user.updatedAt > cloudRow.updated_at;
  });

  // Restoring an old archive after a booking reset must not resurrect sales
  // deleted by that reset. Immutable cloud transactions always win.
  const canReplayBookings = backupTime > resetAt;
  const restorableTransactions = canReplayBookings
    ? recoverableTransactions(backupTransactions, cloud.transactions, resetAt)
    : [];
  const restorableSessions = canReplayBookings
    ? recoverableCashSessions(backupSessions, cloud.cashSessions, resetAt, newestSessionTime)
    : [];

  // This is an APPEND/MERGE, not a replacement. Never surprise an operator
  // with extra revenue or another open till from a backup.
  const assessment = assessBackupRestore(
    { transactions: backupTransactions, cashSessions: backupSessions },
    { transactions: cloud.transactions, cashSessions: cloud.cashSessions },
    backupTime, resetAt,
    { transactions: restorableTransactions, cashSessions: restorableSessions },
  );
  // Primary keys are global across generations. A backup row with an ID
  // already archived in an older generation cannot be upserted into the
  // current generation without violating immutable fiscal records.
  if (restorableTransactions.length || restorableSessions.length) {
    if (!supabase) throw new Error('Cloud ist nicht konfiguriert.');
    for (let offset = 0; offset < restorableTransactions.length; offset += 100) {
      const ids = restorableTransactions.slice(offset, offset + 100).map(row => row.id);
      const { data, error } = await supabase.from('pos_transactions').select('id,booking_generation').in('id', ids);
      if (error) throw new Error('Backup-Bon-IDs konnten nicht überprüft werden: ' + error.message);
      if ((data ?? []).some(row => row.booking_generation !== (reset?.generation ?? 0))) {
        throw new Error('Backup-Import gesperrt: Ein Bon aus einer archivierten Generation hat dieselbe ID. Alte Belege dürfen nicht überschrieben werden.');
      }
    }
    for (let offset = 0; offset < restorableSessions.length; offset += 100) {
      const ids = restorableSessions.slice(offset, offset + 100).map(row => row.id);
      const { data, error } = await supabase.from('pos_cash_sessions').select('id,booking_generation').in('id', ids);
      if (error) throw new Error('Backup-Kassensitzungs-IDs konnten nicht überprüft werden: ' + error.message);
      if ((data ?? []).some(row => row.booking_generation !== (reset?.generation ?? 0))) {
        throw new Error('Backup-Import gesperrt: Eine Kassensitzung aus einer archivierten Generation hat dieselbe ID.');
      }
    }
  }
  if (assessment.requiresConfirmation && !window.confirm(backupMergeConfirmation(assessment))) {
    throw new Error('Backup-Import abgebrochen. Die Cloud-Daten wurden nicht verändert.');
  }

  // Only records that are missing in the cloud or are newer in the backup are
  // written. Cloud-only records are never deleted by a restore.
  if (restorableCategories.length || restorableProducts.length || restorePfand || restoreShots) {
    const catalog = {
      categories: restorableCategories,
      products: restorableProducts,
      pfandSettings: restoredPfand,
      shotOptions: restoredShots ?? [],
    };
    const permittedKeys = new Set([
      ...restorableCategories.map((category) => catalogKey('category', category.id)),
      ...restorableProducts.map((product) => catalogKey('product', product.id)),
      ...(restoreShots ? [catalogKey('setting', SHOT_SETTING_ID)] : []),
      ...(restorePfand ? [catalogKey('setting', PFAND_SETTING_ID)] : []),
    ]);
    const rows = [...buildLocalEntries(catalog, backupTime).values()]
      .filter((entry) => permittedKeys.has(catalogKey(entry.kind, entry.id)))
      .map((entry): CatalogRow => ({
      kind: entry.kind,
      id: entry.id,
      data: entry.json ? JSON.parse(entry.json) : {},
      updated_at: backup.data?.catalogVersions?.[catalogKey(entry.kind, entry.id)]?.updatedAt ?? entry.updatedAt,
      deleted: false,
      }));
    await pushCatalogRows(rows);
  }

  for (const user of restorableStaff) await pushStaffUser(user);

  const generation = reset?.generation ?? 0;
  const bookingEntries: OutboxEntry[] = [
    ...restorableTransactions.map((transaction) => ({
      table: 'pos_transactions' as const,
      row: { id: transaction.id, booking_generation: generation, location: transaction.location, timestamp: transaction.timestamp, data: transaction },
    })),
    ...restorableSessions.map((session) => ({
      table: 'pos_cash_sessions' as const,
      row: { id: session.id, booking_generation: generation, location: session.location, date: session.date, data: session },
    })),
  ];
  // Pending local bookings were synchronized BEFORE this recovery snapshot.
  // Never clear the outbox here: doing so can silently lose real sales.
  await enqueueEntries(bookingEntries);
  while (await flushOutbox()) {
    // Flush all queued backup rows before updating this browser's local data.
  }
  if (backup.data.serverRecovery) {
    if (!supabase) throw new Error('Cloud ist nicht konfiguriert.');
    const { error } = await supabase.rpc('restore_pos_recovery_metadata', { p_metadata: backup.data.serverRecovery });
    if (error) throw new Error(`Sicherheitsdaten/Belegzähler konnten nicht wiederhergestellt werden: ${error.message}`);
  }

  const restoredCategories = mergeById(cloudCatalog.categories, restorableCategories).sort((a, b) => a.sortOrder - b.sortOrder);
  const restoredProducts = mergeById(cloudCatalog.products, restorableProducts).sort((a, b) => a.sortOrder - b.sortOrder);
  const restoredStaff = mergeById(cloudUsers(staffRows), restorableStaff).sort((a, b) => a.name.localeCompare(b.name, 'de'));
  if (reset) rememberBookingReset(reset);

  return {
    data: {
      ...backup.data,
      transactions: mergeById(cloud.transactions, restorableTransactions).sort((a, b) => b.timestamp - a.timestamp),
      cashSessions: mergeById(cloud.cashSessions, restorableSessions),
      categories: restoredCategories,
      products: restoredProducts,
      pfandSettings: restoredPfand,
      shotOptions: restoredShots,
    },
    cloudReset: reset,
    staffUsers: restoredStaff,
  };
}
