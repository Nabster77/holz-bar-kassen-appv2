import type { BackupSyncCheckpoint } from './backupSyncPolicy';

const KEY='woodmo_v3_backup_checkpoint_v1';
const EMPTY: BackupSyncCheckpoint={
  cloudSyncedAt:null,backup1SyncedAt:null,backup2SyncedAt:null,
  backup1Revision:null,backup2Revision:null,lastActivityAt:0,
};

function timeOrNull(value: unknown): number|null {
  return typeof value==='number' && Number.isFinite(value) && value>=0 ? value : null;
}

function revisionOrNull(value: unknown): string|null {
  return typeof value==='string' && /^[a-f0-9]{64}$/i.test(value) ? value : null;
}

export function readBackupCheckpoint(): BackupSyncCheckpoint {
  try {
    const raw=localStorage.getItem(KEY);
    if (!raw) return { ...EMPTY };
    const value: unknown=JSON.parse(raw);
    if (!value || typeof value!=='object' || Array.isArray(value)) return { ...EMPTY };
    const record=value as Record<string,unknown>;
    return {
      cloudSyncedAt:timeOrNull(record.cloudSyncedAt),
      backup1SyncedAt:timeOrNull(record.backup1SyncedAt),
      backup2SyncedAt:timeOrNull(record.backup2SyncedAt),
      backup1Revision:revisionOrNull(record.backup1Revision),
      backup2Revision:revisionOrNull(record.backup2Revision),
      lastActivityAt:timeOrNull(record.lastActivityAt) ?? 0,
    };
  } catch { return { ...EMPTY }; }
}

export function saveBackupCheckpoint(next: BackupSyncCheckpoint): void {
  // Status data only; no business records, passwords, or folder handles.
  localStorage.setItem(KEY,JSON.stringify(next));
}

export function markCloudSyncVerified(at: number): BackupSyncCheckpoint {
  if (!Number.isFinite(at) || at<=0) throw new Error('Ungültiger Synchronisationszeitpunkt.');
  const next={...readBackupCheckpoint(),cloudSyncedAt:at};
  saveBackupCheckpoint(next);
  return next;
}

export function markBackupVerified(stage: 'backup1'|'backup2', revision: string, at: number): BackupSyncCheckpoint {
  if (!Number.isFinite(at) || at<=0 || !/^[a-f0-9]{64}$/i.test(revision)) {
    throw new Error('Sicherung wurde nicht gültig bestätigt.');
  }
  const current=readBackupCheckpoint();
  if (stage==='backup2' && current.backup1Revision!==revision) {
    throw new Error('Backup 2 weicht von der bestätigten Backup-1-Version ab.');
  }
  const next=stage==='backup1'
    ? {...current,backup1Revision:revision,backup1SyncedAt:at}
    : {...current,backup2Revision:revision,backup2SyncedAt:at};
  saveBackupCheckpoint(next);
  return next;
}
