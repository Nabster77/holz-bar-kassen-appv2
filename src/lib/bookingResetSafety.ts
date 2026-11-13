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
  // The legacy RPC deletes all sessions, reset counters and sales. Even if
  // this device has no closes, another device may have already finalized one.
  // Never call the whole-ledger RPC from active mode until a selective server
  // transaction and a matching generation policy have been implemented.
  if (!testMode) {
    throw new Error('Aktivmodus: Buchungs-Reset vorläufig gesperrt, damit Tagesabschlüsse und Buchungen anderer Geräte erhalten bleiben. Ein selektiver, cloudweit abgesicherter Reset ist erforderlich.');
  }
}
