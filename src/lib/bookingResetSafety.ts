import type { CashSession } from '../types';
import { isOpenCashSession } from './activeCashSessions';

/**
 * The existing Cloud reset is a legacy whole-ledger reset.
 * Until the server provides a selective, audit-safe reset, refuse any
 * operation that could erase an active till or a finalized close.
 */
export function assertBookingResetSafe(sessions: readonly CashSession[], testMode: boolean): void {
  if (sessions.some(isOpenCashSession)) {
    throw new Error('Buchungen können bei einer aktiven Kasse nicht zurückgesetzt werden. Bitte die Kasse zuerst endgültig abschließen.');
  }
  if (!testMode && sessions.some((session) =>
    !session.discarded && (
      session.closed || session.closedAt != null ||
      session.dailyCloseFinalizedAt != null || session.dailyCloseSnapshot != null ||
      session.dailyCloseReceiptNumber != null
    ))) {
    throw new Error('Tagesabschlüsse müssen erhalten bleiben. Der bisherige vollständige Reset ist dafür nicht geeignet und wird vorsorglich gesperrt.');
  }
}
