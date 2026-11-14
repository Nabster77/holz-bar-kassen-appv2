import type { CashSession, Transaction } from '@/types';
import type { StornoRecord } from '@/lib/stornoRules';
import { requireValidBackupIntegrity } from '@/lib/backupIntegrity';

/**
 * An old backup has globally reserved IDs in the immutable archive.
 * For a clean generation, produce equivalent records with fresh IDs and
 * traceable source IDs. No archived row is updated or deleted.
 */
export function prepareCleanGenerationRestore(
  input: { transactions: Transaction[]; cashSessions: CashSession[]; stornos: StornoRecord[] },
  makeUuid: () => string = () => crypto.randomUUID(),
): { transactions: Transaction[]; cashSessions: CashSession[]; stornos: StornoRecord[] } {
  requireValidBackupIntegrity(input, 'Backup-Wiederherstellung');
  const transactionIds = new Map(input.transactions.map(row => [row.id, 'recovered-tx-' + makeUuid()]));
  const sessionIds = new Map(input.cashSessions.map(row => [row.id, 'recovered-session-' + makeUuid()]));
  const stornoIds = new Map(input.stornos.map(row => [row.id, makeUuid()]));
  const mapTransaction = (row: Transaction): Transaction => {
    // Older WOODMO backups may not yet have a cashSessionId. Resolve exactly
    // one historic till by location and posting time; reject ambiguous legacy
    // data instead of crediting a sale to an unrelated register.
    const sourceSessionId = row.cashSessionId ?? (() => {
      const matching = input.cashSessions.filter(session =>
        session.location === row.location && row.timestamp >= session.openedAt &&
        (session.closedAt == null || row.timestamp <= session.closedAt));
      if (matching.length !== 1) throw new Error(
        'Historischer Bon ' + row.id + ' kann keiner eindeutigen Kassensitzung zugeordnet werden.'
      );
      return matching[0].id;
    })();
    const cashSessionId = sessionIds.get(sourceSessionId);
    if (!cashSessionId) throw new Error('Kassensitzung zum Originalbon fehlt: ' + row.id);
    return {
      ...row,
      id: transactionIds.get(row.id) ?? (() => { throw new Error('Originalbon fehlt: ' + row.id); })(),
      cashSessionId,
      restoreSourceId: row.id,
    } as Transaction;
  };
  const transactions = input.transactions.map(mapTransaction);
  const salesById = new Map(transactions.map(row => [row.id, row]));
  const mapStorno = (row: StornoRecord): StornoRecord => {
    const originalTransactionId = transactionIds.get(row.originalTransactionId);
    const cashSessionId = sessionIds.get(row.cashSessionId);
    if (!originalTransactionId || !cashSessionId) throw new Error('Stornobeleg ohne Originalbon oder Kasse: ' + row.id);
    const snapshot = salesById.get(originalTransactionId);
    if (!snapshot) throw new Error('Stornobeleg ohne wiederherstellbaren Originalbon: ' + row.id);
    return {
      ...row,
      id: stornoIds.get(row.id)!,
      originalTransactionId,
      cashSessionId,
      originalSnapshot: { ...snapshot },
      restoreSourceId: row.id,
    } as StornoRecord;
  };
  const stornos = input.stornos.map(mapStorno);
  const stornosBySourceId = new Map(input.stornos.map((row, i) => [row.id, stornos[i]]));
  const sessions = input.cashSessions.map((session): CashSession => ({
    ...session,
    id: sessionIds.get(session.id)!,
    restoreSourceId: session.id,
    ...(session.dailyCloseSnapshot ? {
      dailyCloseSnapshot: {
        ...session.dailyCloseSnapshot,
        transactions: session.dailyCloseSnapshot.transactions.map(row => {
          const tx = salesById.get(transactionIds.get(row.id) ?? '');
          if (!tx) throw new Error('Tagesabschluss enthält unbekannten Originalbon: ' + row.id);
          return tx;
        }),
        stornos: (session.dailyCloseSnapshot.stornos ?? []).map(row => {
          const storno = stornosBySourceId.get(row.id);
          if (!storno) throw new Error('Tagesabschluss enthält unbekannten Stornobeleg: ' + row.id);
          return storno;
        }),
      },
    } : {}),
  } as CashSession));
  // Validate again after remapping: nested frozen evidence and active rows must agree.
  requireValidBackupIntegrity({ transactions, cashSessions: sessions, stornos }, 'Backup-Wiederherstellung');
  return { transactions, cashSessions: sessions, stornos };
}
