import type { CashSession, Transaction } from '@/types';

// A calendar day can contain several independent cash sessions.
export function sessionTransactions(transactions: Transaction[], session: CashSession, until = session.closedAt ?? Infinity): Transaction[] {
  return transactions.filter((transaction) => transaction.location === session.location &&
    transaction.timestamp >= session.openedAt && transaction.timestamp <= until);
}
