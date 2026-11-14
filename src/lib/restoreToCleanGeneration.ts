import { supabase } from '@/lib/supabaseClient';
import { fetchLatestBookingReset, rememberBookingReset } from '@/lib/bookingReset';
import { fetchCloudData } from '@/lib/cloudPull';
import { loadCloudStornos } from '@/lib/stornoCloud';
import { readPendingOutbox } from '@/lib/outbox';
import { requireValidBackupIntegrity } from '@/lib/backupIntegrity';
import { prepareCleanGenerationRestore } from '@/lib/cleanGenerationRestore';
import { restoreBackupSafely, type CompleteBackup, type RestoredBackup } from '@/lib/backupRecovery';
import type { Transaction, CashSession } from '@/types';
import type { StornoRecord } from '@/lib/stornoRules';

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(record).sort()
      .filter(key => record[key] !== undefined)
      .map(key => [key, canonical(record[key])]));
  }
  return value;
}
function exactSame<T extends { id: string }>(actual: T[], source: T[]): boolean {
  const byId = new Map(source.map(row => [row.id, JSON.stringify(canonical(row))]));
  return actual.length === source.length &&
    actual.every(row => byId.get(row.id) === JSON.stringify(canonical(row)));
}

/** Returns null only if the active generation already has finance records or
 * backup has none. Existing finance records are NEVER silently replaced.
 * The protected RPC is one atomic database transaction; failed attempts
 * cannot leave a half-restored storno ledger. */
export async function restoreToCleanGeneration(backup: CompleteBackup): Promise<RestoredBackup | null> {
  if (!backup.data || !backup.exportedAt || !Number.isFinite(Date.parse(backup.exportedAt))) {
    throw new Error('Backup-Format oder Exportzeitpunkt ungültig.');
  }
  if (!navigator.onLine || !supabase) throw new Error('Rücksicherung benötigt eine Cloud-Verbindung.');
  if (!Array.isArray(backup.data.transactions) || !Array.isArray(backup.data.cashSessions) ||
      (backup.data.stornos !== undefined && !Array.isArray(backup.data.stornos))) {
    throw new Error('Unvollständige Buchungs-, Kassen- oder Stornolisten.');
  }
  const financial = {
    transactions: backup.data.transactions as Transaction[],
    cashSessions: backup.data.cashSessions as CashSession[],
    stornos: (backup.data.stornos ?? []) as StornoRecord[],
  };
  if (!financial.transactions.length && !financial.cashSessions.length && !financial.stornos.length) return null;
  requireValidBackupIntegrity(financial, 'Backup-Import');

  const reset = await fetchLatestBookingReset();
  const generation = reset?.generation ?? 0;
  const [cloud, currentStornos, pending] = await Promise.all([
    fetchCloudData(null,generation), loadCloudStornos(generation), readPendingOutbox(),
  ]);
  if (cloud.transactions.length || cloud.cashSessions.length || currentStornos.length) return null;
  if (pending.some(item => item.table === 'pos_transactions' || item.table === 'pos_cash_sessions')) {
    throw new Error('Ungesendete lokale Buchungen gefunden. Bitte erst synchronisieren.');
  }

  const prepared = prepareCleanGenerationRestore(financial);
  const approved = window.confirm(
    'WOODMO – HISTORISCHES BACKUP WIEDERHERSTELLEN\\n\\n' +
    'Aktuelle Buchungsgeneration ' + generation + ': LEER.\\n' +
    'Sicherung vom ' + new Date(backup.exportedAt).toLocaleString('de-DE') + ':\\n' +
    financial.transactions.length + ' Buchungen, ' +
    financial.cashSessions.length + ' Kassensitzungen, ' +
    financial.stornos.length + ' Stornos.\\n\\n' +
    'Alte Originalbelege bleiben unverändert archiviert; ' +
    'die wiederhergestellten Einträge erhalten neue technische IDs.\\n\\n' +
    'Möchten Sie die komplette Kasse aus diesem Backup wiederherstellen?'
  );
  if (!approved) throw new Error('Backup-Wiederherstellung abgebrochen. Keine Buchungen verändert.');

  // Server verifies empty generation and expected reset marker once again
  // under exclusive transaction locks, then commits all three ledgers at once.
  const { data, error } = await supabase.rpc('restore_pos_clean_backup_v3',{
    p_financial: prepared,
    p_expected_generation: generation,
    p_backup_exported_at: backup.exportedAt,
  });
  if (error) throw new Error('Rücksicherung nicht eindeutig bestätigt: ' + error.message +
    '. Vor einem erneuten Import den Cloud-Buchungsstand kontrollieren.');
  const result = data as { generation?: number; transactions?: number; cash_sessions?: number; stornos?: number } | null;
  if (!result || Number(result.generation) !== generation ||
      Number(result.transactions) !== prepared.transactions.length ||
      Number(result.cash_sessions) !== prepared.cashSessions.length ||
      Number(result.stornos) !== prepared.stornos.length) {
    throw new Error('Unvollständige Bestätigung der Rücksicherung. Zuerst Cloud-Journal kontrollieren.');
  }

  const [written, writtenStornos] = await Promise.all([
    fetchCloudData(null,generation), loadCloudStornos(generation),
  ]);
  const expectedStornos = prepared.stornos.map(record => {
    const clone = structuredClone(record) as StornoRecord & { restoreSourceId?: string };
    delete clone.restoreSourceId; // immutable server decoder returns only audited fields
    return clone;
  });
  if (!exactSame(written.transactions,prepared.transactions) ||
      !exactSame(written.cashSessions,prepared.cashSessions) ||
      !exactSame(writtenStornos,expectedStornos)) {
    throw new Error('Finanzdaten wurden zurückgespielt, aber die Gegenprüfung ist fehlgeschlagen. ' +
      'Bitte NICHT zurücksetzen, sondern zuerst das Cloud-Journal kontrollieren.');
  }
  requireValidBackupIntegrity({
    transactions:written.transactions,cashSessions:written.cashSessions,stornos:writtenStornos,
  }, 'Rücksicherungsprüfung');

  // Secondary staff/catalog/security recovery is deliberately separate from
  // immutable financial replay. Do not duplicate old daily-close receipt IDs.
  let assets: RestoredBackup;
  try {
    const meta = backup.data.serverRecovery ? {...backup.data.serverRecovery,receipts:[]} : undefined;
    assets = await restoreBackupSafely({
      ...backup,
      data:{...backup.data,transactions:[],cashSessions:[],stornos:[],serverRecovery:meta},
    });
  } catch(cause) {
    throw new Error('Finanzdaten sind vollständig zurückgespielt, aber Stammdaten/' +
      'Sicherheitsdaten sind noch nicht bestätigt. Bitte NICHT zurücksetzen. ' +
      (cause instanceof Error?cause.message:String(cause)));
  }
  if (reset) rememberBookingReset(reset);
  return {
    ...assets,
    cloudReset:reset,
    data:{...assets.data,transactions:written.transactions.sort((a,b)=>b.timestamp-a.timestamp),
      cashSessions:written.cashSessions,stornos:writtenStornos},
  };
}
