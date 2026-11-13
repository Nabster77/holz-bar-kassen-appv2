import type { CashSession } from '../types';
import { isOpenCashSession } from './activeCashSessions';

/**
 * The existing Cloud reset is a legacy whole-ledger reset.
 * Until the server provides a fully verified booking archive AND an atomic
 * admin-only whole-ledger reset, refuse the old unverified cloud reset.
 */
export function assertBookingResetSafe(sessions: readonly CashSession[], testMode: boolean): void {
  if (sessions.some(isOpenCashSession)) {
    throw new Error('Buchungen können bei einer aktiven Kasse nicht zurückgesetzt werden. Bitte die Kasse zuerst endgültig abschließen.');
  }
  // The legacy RPC deletes the ledger without proving that a complete backup
  // was saved. Do not call it until the new administrator reset checks a
  // read-back verified cloud + device archive and moves the generation.
  if (!testMode) {
    throw new Error('Aktivmodus: Der Gesamt-Reset wird nach vollständiger, überprüfter Sicherung freigegeben. Bis zur Fertigstellung dieses Archivierungs- und Prüfablaufs ist die alte Löschfunktion gesperrt.');
  }
}
