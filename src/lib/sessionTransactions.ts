import type { CashSession, Transaction } from '@/types';

/**
 * Only receipts belonging to this cash session.
 * New receipts carry a stable cashSessionId. Legacy receipts remain readable
 * through their original location/time-range rule.
 */
export function sessionTransactions(
  transactions: readonly Transaction[],
  session: CashSession,
  until = session.closedAt ?? Infinity,
): Transaction[] {
  return transactions.filter((transaction) =>
    transaction.location === session.location &&
    transaction.timestamp >= session.openedAt &&
    transaction.timestamp <= until &&
    (!transaction.cashSessionId || transaction.cashSessionId === session.id),
  );
}
