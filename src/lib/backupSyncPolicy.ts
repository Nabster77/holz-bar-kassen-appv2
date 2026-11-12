/**
 * WOODMO V3 backup synchronization policy.
 *
 * Cloud sync stays independent and continues while staff are signed in.
 * Backup 1 follows a successfully reconciled Cloud+Tablet snapshot.
 * Backup 2 only copies already confirmed Backup 1 changes during idle time
 * and ONLY if no employee is logged in. Never run an automatic restore here.
 */
export const BACKUP_1_PERIOD_MS = 15 * 60_000;
export const BACKUP_2_IDLE_MS = 2 * 60 * 60_000;

export type BackupStage = 'cloud' | 'backup1' | 'backup2';
export type BackupSkipReason =
  | 'offline' | 'test-mode' | 'cloud-pending' | 'backup1-pending'
  | 'employee-signed-in' | 'not-idle' | 'busy' | 'up-to-date'
  | 'no-folder-permission';

export interface BackupSyncCheckpoint {
  /** Unix milliseconds after verified Cloud/Tablet consistency. */
  cloudSyncedAt: number | null;
  /** Unix milliseconds after a complete, verified Backup 1 write. */
  backup1SyncedAt: number | null;
  /** Unix milliseconds after a complete, verified Backup 2 write. */
  backup2SyncedAt: number | null;
  backup1Revision: string | null;
  backup2Revision: string | null;
  lastActivityAt: number;
}

export interface BackupSyncConditions {
  now: number;
  cloudOnline: boolean;
  testMode: boolean;
  staffSignedIn: boolean;
  /** A cloud synchronization or a file write is already in progress. */
  busy: boolean;
  /** Unsynced outbox, in-flight checkout or unresolved restore conflict. */
  hasPendingBookings: boolean;
  /** Browser has previously been granted permission; never prompt from timer. */
  folderWritable: boolean;
}

/** No file is touched by this pure, deterministic scheduling function. */
export function backup1Eligibility(
  state: BackupSyncCheckpoint,
  conditions: BackupSyncConditions,
  currentRevision: string,
  manual = false,
): { allowed: boolean; reason?: BackupSkipReason } {
  if (conditions.testMode) return { allowed: false, reason: 'test-mode' };
  if (!conditions.cloudOnline) return { allowed: false, reason: 'offline' };
  if (conditions.busy) return { allowed: false, reason: 'busy' };
  if (conditions.hasPendingBookings || !state.cloudSyncedAt) return { allowed: false, reason: 'cloud-pending' };
  if (!conditions.folderWritable) return { allowed: false, reason: 'no-folder-permission' };
  // Backups never need to block staff logins or the POS UI, but cloud must
  // already have verified the snapshot that is being backed up.
  if (state.backup1Revision === currentRevision) return { allowed: false, reason: 'up-to-date' };
  if (!manual && state.backup1SyncedAt != null &&
      conditions.now - state.backup1SyncedAt < BACKUP_1_PERIOD_MS) {
    return { allowed: false, reason: 'not-idle' };
  }
  return { allowed: true };
}

/**
 * Backup 2 must not start while a staff member is signed in.
 * The two-hour idle requirement from the earlier user specification remains.
 * Both copies are compared by the last completed Backup 1 revision.
 */
export function backup2Eligibility(
  state: BackupSyncCheckpoint,
  conditions: BackupSyncConditions,
): { allowed: boolean; reason?: BackupSkipReason } {
  if (conditions.testMode) return { allowed: false, reason: 'test-mode' };
  if (conditions.staffSignedIn) return { allowed: false, reason: 'employee-signed-in' };
  if (conditions.busy) return { allowed: false, reason: 'busy' };
  if (conditions.hasPendingBookings) return { allowed: false, reason: 'cloud-pending' };
  if (!conditions.folderWritable) return { allowed: false, reason: 'no-folder-permission' };
  if (!state.backup1Revision || !state.backup1SyncedAt) return { allowed: false, reason: 'backup1-pending' };
  if (state.backup1Revision === state.backup2Revision) return { allowed: false, reason: 'up-to-date' };
  if (conditions.now - state.lastActivityAt < BACKUP_2_IDLE_MS) return { allowed: false, reason: 'not-idle' };
  return { allowed: true };
}

export interface SectionVersion { name: string; digest: string; }
/** Incremental: update only changed sections; keep unchanged Backup 2 shards. */
export function backup2IncrementalDiff(
  backup1: readonly SectionVersion[],
  backup2: readonly SectionVersion[],
): SectionVersion[] {
  const existing = new Map(backup2.map((item) => [item.name, item.digest]));
  const names = new Set<string>();
  return backup1.filter((item) => {
    if (!item.name || !item.digest || names.has(item.name)) {
      throw new Error('Unvollständiges oder doppeltes Backup-Manifest.');
    }
    names.add(item.name);
    return existing.get(item.name) !== item.digest;
  });
}

/** Checkpoints are updated only AFTER file commit and integrity verification. */
export function afterVerifiedBackup(
  state: BackupSyncCheckpoint,
  stage: 'backup1' | 'backup2',
  revision: string,
  completedAt: number,
): BackupSyncCheckpoint {
  if (!revision || !Number.isFinite(completedAt)) throw new Error('Sicherung nicht verifiziert.');
  if (stage === 'backup1') return { ...state, backup1Revision: revision, backup1SyncedAt: completedAt };
  if (state.backup1Revision !== revision) throw new Error('Backup 1 hat während des Abgleichs eine neuere Version erhalten.');
  return { ...state, backup2Revision: revision, backup2SyncedAt: completedAt };
}
