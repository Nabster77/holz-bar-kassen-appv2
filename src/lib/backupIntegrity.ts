import type { CashSession, Transaction } from '@/types';
import type { StornoRecord } from '@/lib/stornoRules';

/** Read-only validation before exporting OR importing accounting evidence. */
export function inspectBackupIntegrity(financial: {
  transactions: readonly Transaction[];
  cashSessions: readonly CashSession[];
  stornos: readonly StornoRecord[];
}): string[] {
  const issues: string[] = [];
  const txIds = new Set<string>();
  const sessionIds = new Set<string>();
  const stornoIds = new Set<string>();
  const reversed = new Set<string>();
  const openLocations = new Set<string>();
  const sessions = new Map<string, CashSession>();
  const sales = new Map<string, Transaction>();
  for (const session of financial.cashSessions) {
    if (!session || !session.id || sessionIds.has(session.id)) {
      issues.push('Doppelte oder fehlende Kassensitzungs-ID: ' + (session?.id ?? 'unbekannt'));
      continue;
    }
    sessionIds.add(session.id);
    sessions.set(session.id, session);
    if (!['Friedrichshafen', 'Bregenz'].includes(session.location) ||
        !Number.isFinite(session.openedAt) || !Number.isFinite(session.openingBalance) ||
        session.openingBalance < 0) {
      issues.push('Kassensitzung ' + session.id + ': Standort, Eröffnung oder Anfangsbestand ungültig.');
    }
    const open = !session.closed && !session.closedAt && !session.discarded &&
      !session.dailyCloseFinalizedAt && !session.dailyCloseSnapshot;
    if (open) {
      if (openLocations.has(session.location)) {
        issues.push('Zwei verschiedene Kassen in ' + session.location + ' gleichzeitig offen.');
      }
      openLocations.add(session.location);
    }
  }
  for (const transaction of financial.transactions) {
    if (!transaction || !transaction.id || txIds.has(transaction.id)) {
      issues.push('Doppelte oder fehlende Bon-ID: ' + (transaction?.id ?? 'unbekannt'));
      continue;
    }
    txIds.add(transaction.id);
    sales.set(transaction.id, transaction);
    if (!Number.isFinite(transaction.timestamp) || !Number.isFinite(transaction.total) ||
        !['Friedrichshafen', 'Bregenz'].includes(transaction.location) ||
        !['cash', 'card'].includes(transaction.paymentMethod)) {
      issues.push('Buchung ' + transaction.id + ': ungültiger Betrag, Zeitpunkt, Standort oder Zahlungsart.');
    }
    if (transaction.cashSessionId) {
      const session = sessions.get(transaction.cashSessionId);
      if (!session) issues.push('Buchung ' + transaction.id + ': referenzierte Kassensitzung fehlt.');
      else if (session.location !== transaction.location || transaction.timestamp < session.openedAt) {
        issues.push('Buchung ' + transaction.id + ': Standort oder Zeitpunkt passt nicht zur Kasse.');
      }
    }
  }
  for (const storno of financial.stornos) {
    if (!storno || !storno.id || stornoIds.has(storno.id)) {
      issues.push('Doppelter oder ungültiger Stornobeleg: ' + (storno?.id ?? 'unbekannt'));
      continue;
    }
    stornoIds.add(storno.id);
    if (reversed.has(storno.originalTransactionId)) {
      issues.push('Buchung ' + storno.originalTransactionId + ' ist mehrfach storniert.');
    }
    reversed.add(storno.originalTransactionId);
    const tx = sales.get(storno.originalTransactionId);
    const session = sessions.get(storno.cashSessionId);
    if (!tx || !session) {
      issues.push('Stornobeleg ' + storno.id + ': Originalbon oder Kassensitzung fehlt.');
      continue;
    }
    const gross = Math.round(tx.total * 100);
    const cash = storno.paymentMethod === 'cash' ? -gross : 0;
    const card = storno.paymentMethod === 'card' ? -gross : 0;
    if (storno.originalSnapshot?.id !== tx.id || storno.location !== tx.location ||
        storno.location !== session.location || tx.paymentMethod !== storno.paymentMethod ||
        (tx.cashSessionId && tx.cashSessionId !== storno.cashSessionId) ||
        Math.round(storno.grossAmount * 100) !== gross ||
        Math.round(storno.cashEffect * 100) !== cash ||
        Math.round(storno.cardEffect * 100) !== card ||
        storno.timestamp < tx.timestamp) {
      issues.push('Stornobeleg ' + storno.id + ': Bon, Kassensitzung oder Geldbeträge widersprüchlich.');
    }
  }
  for (const session of financial.cashSessions) {
    if (!session?.dailyCloseSnapshot) continue;
    const frozen = session.dailyCloseSnapshot;
    const frozenStornos = frozen.stornos ?? [];
    const real = financial.stornos.filter(row => row.cashSessionId === session.id);
    if (frozenStornos.length !== real.length ||
        real.some(row => !frozenStornos.some(item =>
          item.id === row.id && item.originalTransactionId === row.originalTransactionId))) {
      issues.push('Tagesabschluss ' + session.id + ': eingefrorene Stornoliste ist unvollständig.');
    }
  }
  return issues;
}

export function requireValidBackupIntegrity(financial: {
  transactions: readonly Transaction[];
  cashSessions: readonly CashSession[];
  stornos: readonly StornoRecord[];
}, action: string): void {
  const conflicts = inspectBackupIntegrity(financial);
  if (conflicts.length) throw new Error(
    action + ' abgebrochen: ' + conflicts.length + ' Konflikt(e) erkannt.\n\n' +
    conflicts.slice(0, 12).map((issue, index) => (index + 1) + '. ' + issue).join('\n') +
    (conflicts.length > 12 ? '\nWeitere Konflikte vorhanden.' : '') +
    '\n\nBitte die betroffenen Buchungen/Kassen mit dem Cloud-Journal abgleichen. ' +
    'Originalbelege oder Stornos nicht manuell überschreiben. Danach erneut prüfen.'
  );
}
