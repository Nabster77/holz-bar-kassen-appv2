import type { CashSession, Location, Transaction } from '@/types';
import { closedSessionReport } from '@/lib/dailyReport';
import { sessionTransactions } from '@/lib/sessionTransactions';

export function hasSessionMovements(session: CashSession, transactions: Transaction[]): boolean {
  return session.entries.length > 0 || session.corrections.length > 0 ||
    (session.closingWithdrawalAmount ?? 0) !== 0 || sessionTransactions(transactions, session).length > 0;
}

/** Cancelling an unused opening is not a cash movement and cannot reset a till. */
export function canDiscardCashSession(session: CashSession, transactions: Transaction[]): boolean {
  return !session.closed && !session.discarded && session.openingBalance === 0 &&
    !session.dailyCloseReceiptNumber && !session.dailyCloseSnapshot && !hasSessionMovements(session, transactions);
}

export function openingBalanceForLocation(sessions: CashSession[], transactions: Transaction[], location: Location): number | null {
  const atLocation = sessions.filter(session => session.location === location);
  const terminal = atLocation.filter(session => session.closed || session.discarded || session.dailyCloseFinalizedAt)
    .sort((a, b) => (a.closedAt ?? a.dailyCloseFinalizedAt ?? a.openedAt) - (b.closedAt ?? b.dailyCloseFinalizedAt ?? b.openedAt) || a.openedAt - b.openedAt);
  let carry: number | null = null;
  for (const session of terminal) {
    const nextOpening = Math.min(...atLocation.filter(next => next.openedAt > session.openedAt).map(next => next.openedAt));
    const until = Math.min(session.closedAt ?? Infinity, nextOpening - 1);
    const booked = session.dailyCloseSnapshot?.transactions ?? sessionTransactions(transactions, session, until);
    const financial = hasSessionMovements(session, booked);
    if (!session.discarded && !session.dailyCloseSnapshot && session.dailyCloseReceiptNumber && Number.isFinite(session.closingBalance) &&
        (financial || session.closingBalance !== 0)) {
      carry = Math.round(session.closingBalance! * 100) / 100;
      continue;
    }
    if (session.discarded || !financial) {
      // Legacy empty closes sometimes contain a default closingBalance=0.
      // With no movement, the previously known balance must stay unchanged.
      if (carry === null && Number.isFinite(session.openingBalance)) carry = session.openingBalance;
      continue;
    }
    let remainder: number | undefined;
    if (session.dailyCloseSnapshot || !Number.isFinite(session.closingBalance)) {
      remainder = closedSessionReport(session, booked, []).dailyCloseCash?.remainingBalance;
    } else {
      // A saved close remains authoritative while cloud transactions load.
      remainder = session.closingBalance;
    }
    if (typeof remainder === 'number' && Number.isFinite(remainder)) carry = Math.round(remainder * 100) / 100;
  }
  return carry;
}
