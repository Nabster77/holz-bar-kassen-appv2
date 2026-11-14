/**
 * Read-only preflight for importing a full WOODMO V3 backup.
 * No financial records may be silently resurrected across reset generations,
 * and two open tills at one site must never be merged.
 */
export interface BackupRestoreTransaction {
  id: string;
  timestamp: number;
  location: string;
  cashSessionId?: string;
}
export interface BackupRestoreSession {
  id: string;
  location: string;
  openedAt: number;
  closed?: boolean;
  closedAt?: number;
  discarded?: boolean;
  dailyCloseFinalizedAt?: number;
  dailyCloseSnapshot?: unknown;
}
export interface BackupRestoreAssessment {
  newTransactions: number;
  newSessions: number;
  existingTransactions: number;
  existingSessions: number;
  existingOpenSessions: number;
  backupTransactions: number;
  backupSessions: number;
  requiresConfirmation: boolean;
}
function isOpen(session: BackupRestoreSession): boolean {
  return !session.closed && !session.closedAt && !session.discarded &&
    !session.dailyCloseFinalizedAt && !session.dailyCloseSnapshot;
}

export function assessBackupRestore(
  backup: { transactions: BackupRestoreTransaction[]; cashSessions: BackupRestoreSession[] },
  cloud: { transactions: BackupRestoreTransaction[]; cashSessions: BackupRestoreSession[] },
  backupExportedAt: number,
  resetAt: number,
  candidates: { transactions: BackupRestoreTransaction[]; cashSessions: BackupRestoreSession[] },
): BackupRestoreAssessment {
  if ((backup.transactions.length > 0 || backup.cashSessions.length > 0) && backupExportedAt <= resetAt) {
    throw new Error(
      'Dieses Backup wurde vor dem letzten Buchungs-Reset erstellt. ' +
      'Historische Buchungen und Kassensitzungen werden in WOODMO V3 unveränderlich archiviert, ' +
      'können aber nicht als aktive Kasse importiert werden. ' +
      'Wiederherstellung gestoppt, ohne Daten zu verändern. ' +
      'Bitte zuerst eine gesonderte, geprüfte Archiv-Wiederherstellung einrichten.',
    );
  }
  const cloudTransactionIds = new Set(cloud.transactions.map(record => record.id));
  const restorableTransactionIds = new Set(candidates.transactions.map(record => record.id));
  const missingReceipts = backup.transactions.filter(record =>
    !cloudTransactionIds.has(record.id) && !restorableTransactionIds.has(record.id));
  if (missingReceipts.length) throw new Error(
    'Backup-Import abgebrochen: ' + missingReceipts.length +
    ' gesicherte Buchung(en) könnten nicht vollständig wiederhergestellt werden. ' +
    'Eine Teilwiederherstellung darf nicht als erfolgreich gemeldet werden.',
  );
  const cloudSessionIds = new Set(cloud.cashSessions.map(session => session.id));
  const restorableSessionIds = new Set(candidates.cashSessions.map(session => session.id));
  const missingSessions = backup.cashSessions.filter(session =>
    !cloudSessionIds.has(session.id) && !restorableSessionIds.has(session.id));
  if (missingSessions.length) throw new Error(
    'Backup-Import abgebrochen: ' + missingSessions.length +
    ' Kassensitzung(en) fehlen nach der Wiederherstellungsplanung.',
  );
  // Updating an existing till from a JSON backup can replace its cash
  // movements; only the normal audited outbox may reconcile that version.
  const overwritten = candidates.cashSessions.find(session => cloudSessionIds.has(session.id));
  if (overwritten) throw new Error(
    'Backup-Import gesperrt: Kassensitzung ' + overwritten.id +
    ' existiert bereits in der Cloud und würde durch die Sicherung überschrieben. ' +
    'Bitte diese Kasse gesondert abgleichen.',
  );
  const cloudId = new Set([
    ...cloud.cashSessions.map(s => s.id),
    ...candidates.cashSessions.map(s => s.id),
  ]);
  for (const [index, session] of candidates.cashSessions.entries()) {
    if (!isOpen(session)) continue;
    if (candidates.cashSessions.slice(index + 1).some(other =>
      other.id !== session.id && other.location === session.location && isOpen(other))) {
      throw new Error('Backup-Import gesperrt: Die Sicherung enthält zwei verschiedene offene Kassen für ' +
        session.location + '.');
    }
  }
  for (const session of candidates.cashSessions) {
    if (!isOpen(session)) continue;
    const conflicting = cloud.cashSessions.find(existing =>
      existing.id !== session.id && existing.location === session.location && isOpen(existing));
    if (conflicting) throw new Error(
      'Backup-Import gesperrt: In ' + session.location +
      ' existiert bereits eine andere geöffnete Kasse. ' +
      'Diese beiden Kassensitzungen dürfen nicht zusammengeführt werden.',
    );
  }
  for (const transaction of candidates.transactions) {
    if (transaction.cashSessionId && !cloudId.has(transaction.cashSessionId)) {
      throw new Error('Backup-Import gesperrt: Buchung ' + transaction.id +
        ' verweist auf eine fehlende Kassensitzung. Kein unvollständiges Journal übernehmen.');
    }
  }
  const existingOpenSessions = cloud.cashSessions.filter(isOpen).length;
  return {
    newTransactions: candidates.transactions.length,
    newSessions: candidates.cashSessions.length,
    existingTransactions: cloud.transactions.length,
    existingSessions: cloud.cashSessions.length,
    existingOpenSessions,
    backupTransactions: backup.transactions.length,
    backupSessions: backup.cashSessions.length,
    requiresConfirmation: (cloud.transactions.length > 0 || cloud.cashSessions.length > 0) &&
      (candidates.transactions.length > 0 || candidates.cashSessions.length > 0),
  };
}

export function backupMergeConfirmation(assessment: BackupRestoreAssessment): string {
  return (
    'WOODMO V3 – Backup-Import mit bestehenden Kassendaten\n\n' +
    'Aktuelle Cloud: ' + assessment.existingTransactions + ' Buchung(en), ' +
    assessment.existingSessions + ' Kassensitzung(en), davon ' +
    assessment.existingOpenSessions + ' noch offen.\n' +
    'Sicherungsdatei: ' + assessment.backupTransactions + ' Buchung(en), ' +
    assessment.backupSessions + ' Kassensitzung(en).\n' +
    'Zum Hinzufügen/Aktualisieren vorgesehen: ' + assessment.newTransactions +
    ' Buchung(en), ' + assessment.newSessions + ' Kassensitzung(en).\n\n' +
    'ACHTUNG: Diese Funktion führt Daten zusammen; vorhandene Buchungen ' +
    'werden NICHT gelöscht. Neue Buchungen können Umsätze und Bargeldbestände verändern. ' +
    'Originalbons und unveränderliche Stornos werden nicht überschrieben.\n\n' +
    'Möchten Sie diese Zusammenführung ausdrücklich durchführen?'
  );
}
